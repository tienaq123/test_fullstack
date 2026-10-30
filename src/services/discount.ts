const DISCOUNT_THRESHOLD = 1_000_000;
const DISCOUNT_PERCENT = 10;
const MAX_DISCOUNT = 200_000;

// 10% off orders >= 1,000,000 VND, capped at 200,000 VND.
// Integer math (* 10 / 100, not * 0.1) and rounding down, so the discount never exceeds 10%.
export function calculateDiscount(subtotal: number): number {
  if (subtotal < DISCOUNT_THRESHOLD) return 0;

  const discount = Math.floor((subtotal * DISCOUNT_PERCENT) / 100);
  return Math.min(discount, MAX_DISCOUNT);
}
