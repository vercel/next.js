import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'] })

export default function Page() {
  return (
    <>
      <p className={inter.className}>script-nonce</p>
    </>
  )
}
