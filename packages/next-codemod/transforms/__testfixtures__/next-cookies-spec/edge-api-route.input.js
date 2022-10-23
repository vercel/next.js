export default function handler(req) {
  const cookie = req.cookies.get('token')
  const { cookies, headers } = req
  const c = cookies.get('token')

  console.log(req.cookies.get('token'))
  console.log(cookies.get('token'))
  cookies.get('token')

  const h = headers.get('bearer')
  new URLSearchParams({}).set('bearer')
}
