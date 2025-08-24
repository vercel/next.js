import Image from 'next/image'
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'] })

export default function Page() {
  return (
    <>
      <Image priority src="/favicon.ico" alt="favicon" width={16} height={16} />
      <h1 className={inter.className}>Hello World</h1>
    </>
  )
}
