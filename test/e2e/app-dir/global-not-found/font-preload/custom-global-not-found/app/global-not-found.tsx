import localFont from 'next/font/local'

const notFoundFont = localFont({ src: '../fonts/font3_inter-regular.woff2' })

export default function GlobalNotFound() {
  return (
    <html lang="en">
      <body className={notFoundFont.className}>
        <h1 id="global-not-found">Not found</h1>
      </body>
    </html>
  )
}
