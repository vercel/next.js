import { removeCookies } from 'cookies-next'

export default async function setApiCookie(req, res) {
  try {
    removeCookies('api-cookie', { req, res })
    res.status(200).send('remove api cookies')
  } catch (error) {
    res.status(400).send(error.message)
  }
}
