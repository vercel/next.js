import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'], weight: '900' })

export default function Page() {
  return <h1 className={inter.className}>Hello World</h1>
}
