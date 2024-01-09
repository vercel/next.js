import React from 'react'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import CustomThirdwebProvider from '@/components/CustomThirdwebProvider'
import '@/styles/globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Thirdweb example',
  description: 'An example for interaction with smart contract using thirdweb',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <CustomThirdwebProvider>{children}</CustomThirdwebProvider>{' '}
      </body>
    </html>
  )
}
