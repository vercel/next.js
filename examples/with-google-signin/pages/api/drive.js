import { readFile } from 'fs'
import path from 'path'
import { google } from 'googleapis'

const TOKEN_PATH = path.join(process.cwd(), './tokens.json')

export default (req, res) => {
  const client = new google.auth.OAuth2(
    process.env.google_client_id,
    process.env.google_client_secret,
    process.env.google_redirect_uri
  )

  readFile(TOKEN_PATH, async (err, tokens) => {
    if (err) {
      console.log(err)
      res.status(500).send('Error loading token file.')
    }
    client.setCredentials(JSON.parse(tokens))
    try {
      const files = await getDriveFileNames(client)
      res.status(200).json(files)
    } catch (e) {
      console.error(e)
      res.status(500).send('Error fetching Google Drive file names.')
    }
  })
}

const getDriveFileNames = client => {
  return new Promise((resolve, reject) => {
    const drive = google.drive({ version: 'v3', auth: client })
    drive.files.list(
      {
        pageSize: 10,
        fields: 'files(id, name)',
      },
      (err, res) => {
        if (err) reject(err)
        const files = res.data.files
        if (files.length) {
          const fileNames = files.map(file => {
            return {
              id: file.id,
              name: file.name,
            }
          })
          resolve(fileNames)
        } else {
          resolve('No files found.')
        }
      }
    )
  })
}
