# Test cases: POST /api/bookings

Mỗi trường hợp ghi: request gửi lên, hệ thống xử lý thế nào và response trả về. Các response trong file được **lấy từ lần chạy thật**, không phải viết tay.

## Chạy thử

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # unit test cho phần tính giảm giá
```

```bash
curl -s -X POST http://localhost:3000/api/bookings \
  -H 'Content-Type: application/json' \
  -d '{"ticketId":1,"quantity":2}'
```

**Dữ liệu khởi tạo:**

| id | Vé | Giá | Tồn kho |
|----|----|-----|---------|
| 1 | Vé VinWonders | 750.000 | 5 |
| 2 | Vé Safari | 650.000 | 3 |

Dữ liệu lưu trong bộ nhớ, nên restart server là tồn kho về như ban đầu. Các case bên dưới phải **chạy theo đúng thứ tự** từ lúc server mới khởi động, vì case sau phụ thuộc tồn kho mà case trước để lại.

## Luồng xử lý một request

```
Body JSON hỏng?                         → 400 INVALID_JSON
ticketId / quantity không phải số nguyên dương? → 400 VALIDATION_ERROR
Không tìm thấy vé?                      → 404 TICKET_NOT_FOUND
quantity > tồn kho?                     → 409 INSUFFICIENT_STOCK
Hợp lệ → trừ kho → tính tiền (giá lấy ở server) → tính giảm giá → tạo đơn → 201
```

Mọi lỗi trả cùng một format: `{ "error": { "code": "...", "message": "..." } }`

**Quy tắc giảm giá:** nếu tổng trước giảm ≥ 1.000.000đ thì giảm 10%, nhưng tối đa 200.000đ.

---

## A. Đặt vé thành công và giảm giá

### #1 Đạt ngưỡng giảm giá
```json
POST {"ticketId":1,"quantity":2}
```
- **Xử lý:** 750.000 × 2 = 1.500.000, ≥ 1.000.000 nên giảm 10% = 150.000 (chưa tới mức trần). Tồn kho vé 1: 5 → 3.
- **Response 201:**
```json
{"bookingId":"BK001","totalAmount":1500000,"discountAmount":150000,"finalAmount":1350000,"status":"CONFIRMED"}
```

### #3 Vượt mức giảm tối đa
```json
POST {"ticketId":1,"quantity":3}
```
- **Xử lý:** 750.000 × 3 = 2.250.000. 10% là 225.000, lớn hơn mức trần, nên **chỉ giảm 200.000**. Tồn kho vé 1: 3 → 0.
- **Response 201:**
```json
{"bookingId":"BK002","totalAmount":2250000,"discountAmount":200000,"finalAmount":2050000,"status":"CONFIRMED"}
```

### #14 Dưới ngưỡng, client gửi kèm giá giả
```json
POST {"ticketId":2,"quantity":1,"price":1}
```
- **Xử lý:** field `price` của client **bị bỏ qua**, giá luôn lấy ở server. 650.000 < 1.000.000 nên không giảm. Tồn kho vé 2: 3 → 2.
- **Response 201:**
```json
{"bookingId":"BK003","totalAmount":650000,"discountAmount":0,"finalAmount":650000,"status":"CONFIRMED"}
```

### #15 Vừa vượt ngưỡng
```json
POST {"ticketId":2,"quantity":2}
```
- **Xử lý:** 650.000 × 2 = 1.300.000, giảm 10% = 130.000. Tồn kho vé 2: 2 → 0.
- **Response 201:**
```json
{"bookingId":"BK004","totalAmount":1300000,"discountAmount":130000,"finalAmount":1170000,"status":"CONFIRMED"}
```

**Ý nghĩa các field:** `totalAmount` là tiền trước giảm giá, `discountAmount` là số tiền được giảm, `finalAmount` là số tiền phải trả.

---

## B. Không đủ vé

| # | Request | Tồn kho lúc gọi | Response |
|---|---------|-----------------|----------|
| 2 | `{"ticketId":1,"quantity":4}` | 3 | **409** `{"error":{"code":"INSUFFICIENT_STOCK","message":"Only 3 ticket(s) left, requested 4"}}` |
| 4 | `{"ticketId":1,"quantity":1}` | 0 | **409** `{"error":{"code":"INSUFFICIENT_STOCK","message":"Only 0 ticket(s) left, requested 1"}}` |

- **Xử lý:** hệ thống từ chối cả đơn chứ **không bán một phần**. Tồn kho giữ nguyên, không tạo đơn và không tốn mã đơn: sau case #2, đơn thành công tiếp theo vẫn là BK002.

## C. Vé không tồn tại

| # | Request | Response |
|---|---------|----------|
| 5 | `{"ticketId":99,"quantity":1}` | **404** `{"error":{"code":"TICKET_NOT_FOUND","message":"Ticket 99 not found"}}` |

## D. Input không hợp lệ

Hệ thống validate chặt và **không tự ép kiểu**: chuỗi `"2"` bị từ chối chứ không được hiểu thành số 2. Message nói rõ field nào sai. Các case này không làm thay đổi dữ liệu.

| # | Request | Lý do bị từ chối | Response (400 `VALIDATION_ERROR`) |
|---|---------|------------------|-----------------------------------|
| 6 | `{"ticketId":2,"quantity":0}` | không dương | `quantity must be a positive integer` |
| 7 | `{"ticketId":2,"quantity":-1}` | số âm | `quantity must be a positive integer` |
| 8 | `{"ticketId":2,"quantity":1.5}` | không phải số nguyên | `quantity must be a positive integer` |
| 9 | `{"ticketId":2,"quantity":"2"}` | là chuỗi, không phải số | `quantity must be a positive integer` |
| 10 | `{"ticketId":2}` | thiếu quantity | `quantity must be a positive integer` |
| 11 | `{}` hoặc không gửi body | thiếu ticketId | `ticketId must be a positive integer` |
| 12 | `{"ticketId":"abc","quantity":1}` | ticketId sai kiểu | `ticketId must be a positive integer` |

## E. Body không phải JSON

| # | Request | Response |
|---|---------|----------|
| 13 | `{bad json` | **400** `{"error":{"code":"INVALID_JSON","message":"Request body is not valid JSON"}}` |

## F. Nhiều người mua cùng lúc

Gửi **10 request song song**, mỗi request mua 1 vé Safari (tồn kho 3), từ một server mới khởi động:

```bash
seq 10 | xargs -P 10 -I{} curl -s -o /dev/null -w '%{http_code}\n' \
  -X POST http://localhost:3000/api/bookings \
  -H 'Content-Type: application/json' -d '{"ticketId":2,"quantity":1}' | sort | uniq -c
```

**Kết quả:** `3 × 201`, `7 × 409`. Bán đúng 3 vé, không vượt tồn kho. Giải thích chi tiết ở [ANSWERS.md](ANSWERS.md#1-race-condition-và-cách-không-bán-vượt-tồn-kho).

## G. Các mốc biên của giảm giá (unit test)

Giá vé 750.000 và 650.000 không cộng ra **đúng** 1.000.000 hay 2.000.000, nên không gọi API để thử các mốc này được. Vì vậy hàm tính giảm giá được tách riêng và test trực tiếp trong [src/services/discount.test.ts](src/services/discount.test.ts):

| Trường hợp | Tổng trước giảm | Giảm |
|------------|-----------------|------|
| Dưới ngưỡng | 999.999 | 0 |
| **Vừa đạt ngưỡng** | 1.000.000 | 100.000 |
| Giữa ngưỡng và trần | 1.300.000 | 130.000 |
| **Vừa chạm trần** | 2.000.000 | 200.000 |
| **Vượt trần** | 2.250.000 | 200.000 |
| Số lẻ | 1.000.009 | 100.000 (làm tròn xuống) |

```
$ npm test
ℹ tests 6
ℹ pass 6
ℹ fail 0
```
