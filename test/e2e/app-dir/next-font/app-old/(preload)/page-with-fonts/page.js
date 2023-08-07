import localFont from '@next/font/local'

const pageFont = localFont({ src: './page-font.woff2' })

export default function HomePage() {
  return (
    <p id="page-with-fonts" className={pageFont.className}>
      {JSON.stringify(pageFont)}
    </p>
  )
}
