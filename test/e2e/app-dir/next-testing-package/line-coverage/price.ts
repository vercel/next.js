export function price(quantity: number) {
  if (quantity >= 10) {
    return quantity * 8
  }
  return quantity * 10
}

export function unusedPrice() {
  return -1
}
