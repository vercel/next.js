'use client'
import React from 'react'
import { ThirdwebProvider } from '@thirdweb-dev/react'

interface CustomThirdwebProviderProps {
  children: React.ReactNode
}
// Wrap provider around children components
export default function CustomThirdwebProvider({
  children,
}: CustomThirdwebProviderProps) {
  return (
    <ThirdwebProvider
      clientId={process.env.NEXT_PUBLIC_TEMPLATE_CLIENT_ID} // Thirdweb client ID
      activeChain={'mumbai'} // Active chain: Mumbai
    >
      {children}
    </ThirdwebProvider>
  )
}
