export async function outerValue() {
  const { value } = await import('./inner')
  return value
}
