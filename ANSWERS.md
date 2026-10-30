# Trả lời câu hỏi

1. [Race condition và cách không bán vượt tồn kho](#1-race-condition-và-cách-không-bán-vượt-tồn-kho)
2. [Cách tính giảm giá](#2-cách-tính-giảm-giá)
3. [Sử dụng AI và cách kiểm chứng](#3-sử-dụng-ai-và-cách-kiểm-chứng)

---

## 1. Race condition và cách không bán vượt tồn kho

### Vấn đề

Đặt vé gồm 2 bước: **kiểm tra** tồn kho, rồi **trừ** tồn kho. Đây là kiểu "check-then-act". Nếu giữa 2 bước này có request khác chen vào thì sẽ bán quá số vé:

```
Tồn kho = 1
Request A: kiểm tra 1 ≥ 1 ✔
Request B: kiểm tra 1 ≥ 1 ✔      ← B vẫn thấy 1 vì A chưa trừ
Request A: trừ kho  → 0
Request B: trừ kho  → -1         ← bán vượt
```

### Cách bài này xử lý

Toàn bộ đoạn từ kiểm tra đến trừ kho nằm trong hàm `createBooking`, và hàm này **chạy đồng bộ, không có `await`** ([src/services/booking.service.ts](src/services/booking.service.ts)):

```ts
if (quantity > ticket.stock) {      // dòng 18: kiểm tra
  throw new AppError(409, "INSUFFICIENT_STOCK", ...);
}
ticket.stock -= quantity;           // dòng 26: trừ kho
```

Node.js chạy JavaScript trên **một luồng** (event loop). Một đoạn code đồng bộ luôn chạy hết từ đầu đến cuối thì request khác mới được xử lý. Vì vậy không request nào chen vào được giữa dòng 18 và dòng 26. Đoạn này đóng vai trò như một critical section mà không cần dùng lock.

Đầu hàm có comment cảnh báo, để người sửa sau không vô tình thêm `await` vào giữa.

### Kiểm chứng

**1. Gửi 10 request song song**, mỗi request mua 1 vé Safari (tồn kho 3), qua API thật:

```
3 × 201 Created
7 × 409 INSUFFICIENT_STOCK
```

**2. Cố ý làm sai để chứng minh điều ngược lại.** Tôi chạy cùng logic đó trong một script riêng (không nằm trong repo), lần này chèn `await` (giả lập gọi DB hoặc thanh toán) vào giữa bước kiểm tra và bước trừ kho:

| Phiên bản | Thành công | Bị từ chối | Tồn kho cuối |
|-----------|------------|------------|--------------|
| Đồng bộ (code hiện tại) | 3 | 7 | **0** |
| Có `await` giữa kiểm tra và trừ kho | 10 | 0 | **-7** |

Chỉ một dòng `await` đặt sai chỗ là đủ để bán vượt 7 vé. Điều này cho thấy tính đúng đắn của code hiện tại phụ thuộc vào việc giữ đoạn này đồng bộ.

### Khi nào cách này không còn đúng

Cách hiện tại chỉ đúng khi dữ liệu nằm **trong bộ nhớ của một process duy nhất**. Nó sẽ hỏng khi:
- Phải `await` giữa kiểm tra và trừ kho, ví dụ đọc tồn kho từ DB rồi mới ghi lại.
- Chạy **nhiều instance**: PM2 cluster, nhiều pod, có load balancer. Mỗi process có bản tồn kho riêng, không biết process khác đã bán gì.

Lúc đó phải đưa việc chống bán vượt **xuống database**, vì database là nơi duy nhất mọi instance cùng nhìn thấy.

### Thiết kế khi dùng database

**Cách chọn: gộp kiểm tra và trừ kho vào một câu UPDATE có điều kiện**

```sql
BEGIN;

UPDATE tickets
SET    stock = stock - $quantity
WHERE  id = $ticketId AND stock >= $quantity;
-- Số dòng bị ảnh hưởng = 0 → không đủ vé → ROLLBACK, trả 409

INSERT INTO bookings (...) VALUES (...);

COMMIT;
```

- Kiểm tra và trừ kho nằm trong **cùng một câu lệnh**. Database khóa dòng đó trong lúc cập nhật, nên 2 request không thể cùng trừ khi chỉ còn 1 vé.
- Đặt trong transaction để trừ kho và tạo đơn cùng thành công hoặc cùng thất bại. Không có chuyện trừ kho rồi mà không có đơn.
- Đơn giản và nhanh, không cần retry.

**Các cách khác:**

| Cách | Cơ chế | Khi nào dùng |
|------|--------|--------------|
| Khóa bi quan | `SELECT ... FOR UPDATE` khóa dòng vé, kiểm tra, cập nhật, rồi `COMMIT` | Khi cần đọc dữ liệu rồi xử lý logic phức tạp trước khi ghi |
| Khóa lạc quan | Thêm cột `version`, `UPDATE ... WHERE version = $v`. Nếu thất bại thì đọc lại và thử lại | Khi ít tranh chấp. Nếu tranh chấp nhiều thì retry liên tục |
| Redis `DECRBY` / Lua script | Trừ kho atomic trên Redis, sau đó ghi đơn vào DB | Flash sale, lưu lượng rất lớn |
| Hàng đợi | Đẩy mọi đơn vào queue, một worker xử lý tuần tự | Khi chấp nhận xử lý bất đồng bộ |

**Lớp bảo vệ cuối:** thêm ràng buộc `CHECK (stock >= 0)` trên bảng `tickets`. Nếu code có bug thì database vẫn từ chối, thay vì để tồn kho âm.

### Các vấn đề liên quan (chưa làm vì đề không yêu cầu)

- **Client gửi lại request** khi bị timeout sẽ tạo 2 đơn. Cách xử lý: client gửi kèm header `Idempotency-Key`, server lưu key này và trả lại đúng đơn cũ nếu gặp key trùng.
- **Có bước thanh toán:** không nên trừ kho vĩnh viễn ngay. Tạo đơn trạng thái `PENDING` để giữ vé có thời hạn, thanh toán xong thì chuyển `CONFIRMED`, quá hạn thì trả vé về kho.

---

## 2. Cách tính giảm giá

**Quy tắc của đề:** nếu tổng trước giảm ≥ 1.000.000đ thì giảm 10%, nhưng tối đa 200.000đ.

```
totalAmount    = giá vé (lấy ở server) × quantity
discountAmount = totalAmount < 1.000.000 ? 0
               : min( floor(totalAmount × 10 / 100), 200.000 )
finalAmount    = totalAmount − discountAmount
```

Code nằm ở [src/services/discount.ts](src/services/discount.ts), là một hàm thuần chỉ nhận tổng tiền và trả về số tiền giảm.

**Các quyết định:**

| Quyết định | Lý do |
|------------|-------|
| So sánh `>=` 1.000.000 | Đề ghi "từ 1.000.000 trở lên" |
| `× 10 / 100` thay vì `× 0.1` | Tránh sai số số thực: `999999 * 0.1 = 99999.90000000001`. Tính trên số nguyên thì luôn chính xác |
| Làm tròn **xuống** | Số tiền giảm không bao giờ vượt quá 10% |
| Trả cả 3 field `totalAmount`, `discountAmount`, `finalAmount` | Đọc response là hiểu ngay đơn được giảm bao nhiêu. `totalAmount` giữ nguyên nghĩa "giá × số lượng" như trước |
| Đặt ngưỡng, phần trăm, mức trần thành hằng số có tên | Khi đổi chính sách chỉ cần sửa một chỗ |
| Tách thành hàm thuần riêng | Để test được các mốc biên mà API không tạo ra được |

**Ví dụ:**

| Trường hợp | Tổng trước giảm | 10% | Giảm thực tế | Phải trả |
|------------|-----------------|-----|--------------|----------|
| Dưới ngưỡng | 650.000 | | 0 | 650.000 |
| Vừa đạt ngưỡng | 1.000.000 | 100.000 | 100.000 | 900.000 |
| Trên ngưỡng | 1.500.000 | 150.000 | 150.000 | 1.350.000 |
| Vừa chạm trần | 2.000.000 | 200.000 | 200.000 | 1.800.000 |
| Vượt trần | 2.250.000 | 225.000 | **200.000** | 2.050.000 |

Mức trần chỉ có tác dụng khi tổng **lớn hơn** 2.000.000. Tại đúng 2.000.000 thì 10% vừa bằng mức trần.

**Kiểm thử:** với giá 750k và 650k, không tổ hợp nào ra đúng 1.000.000 hay 2.000.000. Vì vậy các mốc biên được test bằng unit test (`npm test`, 6 test, dùng `node:test` có sẵn trong Node nên không cần cài thêm thư viện). Các trường hợp dưới ngưỡng, trên ngưỡng và vượt trần còn được test thêm qua API. Xem [TEST_CASES.md](TEST_CASES.md).

---

## 3. Sử dụng AI và cách kiểm chứng

Tôi dùng Claude Code để lập kế hoạch theo phase và sinh phần lớn code. Phần của tôi: chốt các quyết định thiết kế khi AI đưa ra phương án, review từng phase trước khi đi tiếp, và yêu cầu mọi kết luận phải được kiểm chứng bằng cách chạy thật.

### Phần AI hỗ trợ

| Phần | AI làm | Tôi chốt / cách kiểm chứng |
|------|--------|------------------------------|
| Khung project | Sinh cấu hình Express + TypeScript | Chạy server, gọi `/health`, chạy `tsc` |
| Types, store, `AppError` | Sinh code | Duyệt việc lưu `unitPrice` để sau này đổi giá vé không làm sai đơn cũ. Chạy `tsc` |
| Booking service | Sinh code | Chạy thử từng kịch bản, đối chiếu tiền, mã đơn, tồn kho sau mỗi lần gọi |
| Route, validate, error handler | Sinh code | Chốt tự validate thay vì dùng zod, chốt mã 409 cho hết vé. Gọi curl đủ 15 case |
| Giảm giá | Sinh code và unit test | Chốt ý nghĩa `totalAmount`, làm tròn xuống, test biên bằng unit test |
| Trang test UI (`public/index.html`) | Viết toàn bộ (HTML + JS thuần) | Chỉ là công cụ test thay Postman, không thuộc phạm vi đề. Kiểm tra trang được phục vụ đúng và API không bị ảnh hưởng |
| Tài liệu này | Soạn nội dung | Đối chiếu với kết quả chạy thật |

### Lỗi phát hiện trong quá trình kiểm chứng

**1. Server báo chạy thành công dù thực tế không chạy** (AI phát hiện khi test). Khi chạy thử lúc port 3000 đang bị chiếm, log vẫn in "Server running". Nguyên nhân: Express 5 không throw lỗi `listen` (`EADDRINUSE`) mà truyền nó vào callback. Đã sửa: callback kiểm tra `err` rồi throw ([src/index.ts](src/index.ts)).

**2. Service có thể bị cộng ngược tồn kho** (AI nêu ra, tôi chốt cách xử lý). Ban đầu chỉ route validate `quantity`. Nếu service bị gọi với `quantity = -2` thì `stock -= -2` sẽ **tăng** thêm 2 vé. Tôi chọn thêm guard ở đầu service, chấp nhận kiểm tra 2 lần ([booking.service.ts dòng 8–11](src/services/booking.service.ts)).

**3. Kiểm tra xem test có thật sự bắt được lỗi không.** Test pass chưa đủ để tin, nên đã cố ý cài lỗi vào code rồi chạy lại:
- Đổi `<` thành `<=` ở chỗ so ngưỡng: test "vừa đạt ngưỡng" fail.
- Bỏ giới hạn 200.000: test "vượt trần" fail.
- Khôi phục code: 6/6 pass.

**4. Race condition.** Không dừng ở lập luận "Node chạy một luồng" mà gửi 10 request song song và giả lập phiên bản có `await` để thấy bán vượt thật (mục 1).

### Cách tôi kiểm soát code AI sinh ra

- Làm theo từng phase. Hết mỗi phase, AI phải chạy `tsc` và test rồi giải thích code; tôi review xong mới cho làm tiếp.
- Chỗ nào đề không nói rõ (nghĩa của `totalAmount`, cách làm tròn, validate ở đâu) thì AI phải hỏi lại, tôi chốt, không để AI tự đoán.
- Không thêm thư viện hay tính năng ngoài đề.
