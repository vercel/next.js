import localFont from 'next/font/local'

const font = localFont({ src: './font.woff2' })

export default function Page() {
  return <p className={font.className}>Page with a cached preload header</p>
}
