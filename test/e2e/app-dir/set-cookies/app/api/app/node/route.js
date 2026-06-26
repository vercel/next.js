import cookies from '../../../../cookies.mjs'

export async function GET() {
  const headers = new Headers()
  for (const cookie of cookies) {
    headers.append('set-cookie', cookie)
  }

  return new Response(null, { headers })
}
