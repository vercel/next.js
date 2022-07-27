import { getCookie, getCookies } from 'cookies-next'

export default async function getApiCookie(req, res) {
  try {
    const currentCookie = getCookie('api-cookie', { req, res })
    const allCookies = getCookies({ req, res })

    console.log('currentCookie: ', currentCookie)
    console.log('allCookies: ', allCookies)
    res.status(200).send('get api cookies')
  } catch (error) {
    res.status(400).send(error.message)
  }
}
