const LOCALE = 'en-US'

const formatDiscount = new Intl.NumberFormat(LOCALE, {
  style: 'percent',
})

function formatPrice({ amount, currencyCode }, quantity) {
  const formatCurrency = new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: currencyCode,
  })

  return formatCurrency.format(amount * quantity)
}

export default function formatVariantPrice(
  { priceV2, compareAtPriceV2 },
  quantity = 1
) {
  const amount = Number(priceV2.amount)
  const compareAtAmount = Number(compareAtPriceV2?.amount)

  const hasDiscount = compareAtAmount > amount
  const discount = hasDiscount
    ? formatDiscount.format((compareAtAmount - amount) / compareAtAmount)
    : null

  const price = formatPrice(priceV2, quantity)
  const compareAtPrice = hasDiscount
    ? formatPrice(compareAtPriceV2, quantity)
    : null

  return { price, compareAtPrice, discount, amount, compareAtAmount }
}
