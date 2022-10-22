export default function handler(req) {
  const cookie = req.cookies.get('token')?.value
  const { cookies, headers } = req
  const c = cookies.get('token')?.value

  console.log(req.cookies.get('token')?.value)
  console.log(cookies.get('token')?.value)
  cookies.get('token')?.value

  const h = headers.get('bearer')
  new URLSearchParams({}).set('bearer')
}
