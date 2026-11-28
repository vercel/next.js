import localFont from 'next/font/local'

const notFoundFont = localFont({ src: '../fonts/font3_inter-regular.woff2' })

export default function NotFound() {
  return (
    <h1 id="not-found" className={notFoundFont.className}>
      Not found
    </h1>
  )
}
