import { Open_Sans } from 'next/font/google'
const openSans = Open_Sans({ subsets: ['latin'] })

export default function Inter() {
  return <p className={openSans.className}>Hello world</p>
}
