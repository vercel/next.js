export const metadata = { title: 'Complete global 404' }

async function message() {
  'use cache'
  return 'Unknown export route'
}

export default async function GlobalNotFound() {
  return (
    <html lang="en">
      <body>
        <p id="unknown-export-route">{await message()}</p>
      </body>
    </html>
  )
}
