import localFont from '@next/font/local'

const font = localFont()

export default function Index() {
  return <p className={font.className}>Hello world!</p>
}
