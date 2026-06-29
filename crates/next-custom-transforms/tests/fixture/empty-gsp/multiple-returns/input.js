export async function generateStaticParams() {
  if (process.env.X) {
    return [{ slug: 'a' }]
  }
  return []
}
