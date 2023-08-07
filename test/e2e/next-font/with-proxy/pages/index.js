import { Oswald } from 'next/font/google'
const oswald = Oswald({ subsets: ['latin'] })
export default function Index() {
  return <p className={oswald.className}>Hello world</p>
}
