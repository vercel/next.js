import localFont from '@next/font/local'

const font = localFont({ src: './fake-font.woff2' })

export default function Index() {
  return <p className={font.className}>Hello world!</p>
}
