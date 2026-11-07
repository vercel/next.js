export function getOrigin() {
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }
  if (process.env.PORT) {
    return `http://localhost:${process.env.PORT}`
  }
  throw new Error('The fixture requires VERCEL_URL or PORT')
}
