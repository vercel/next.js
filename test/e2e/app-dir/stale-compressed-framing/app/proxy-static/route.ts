export const dynamic = 'force-static'
export const revalidate = 3600

export async function GET() {
  return fetch(`http://127.0.0.1:${process.env.TEST_UPSTREAM_PORT}/gzip`)
}
