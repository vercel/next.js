import React from 'react'
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'] })

const Page = () => {
  return <div className={inter.className}>Hello</div>
}

export default Page
