import { writeFile } from 'fs'
import path from 'path'
import { google } from 'googleapis'

const TOKEN_PATH = path.join(process.cwd(), './tokens.json')

const storeOAuthTokens = async (client, code) => {
  const { tokens } = await client.getToken(code)
  writeFile(TOKEN_PATH, JSON.stringify(tokens), err => {
    if (err) return console.error(err)
  })
}

export default (req, res) => {
  const client = new google.auth.OAuth2(
    process.env.google_client_id,
    process.env.google_client_secret,
    process.env.google_redirect_uri
  )

  try {
    storeOAuthTokens(client, req.body)
  } catch (e) {
    console.error(e)
    res.status(500).end()
  }

  res.status(200).end()
}
