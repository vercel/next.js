'use client'
import { ConnectWallet } from '@thirdweb-dev/react'

export default function ConnectButton() {
  // Return the ConnectWallet component
  // Set the dropdown position to align to the center of the button
  return (
    <ConnectWallet
      dropdownPosition={{
        side: 'bottom',
        align: 'center',
      }}
    />
  )
}
