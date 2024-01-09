'use client'
import { Web3Button } from '@thirdweb-dev/react'
import { contractAddresses } from '@/constants'
import { useContract, useContractWrite } from '@thirdweb-dev/react'

export default function Withdraw() {
  // Connect to the contract using useContract
  const { contract } = useContract(contractAddresses['80001'])

  // Interact with the contract using useContractWrite
  const { mutateAsync, isLoading } = useContractWrite(contract, 'withdraw')

  // Return the Web3Button component
  return (
    <Web3Button
      contractAddress={contractAddresses['80001']}
      action={() => mutateAsync({ args: [] })}
    >
      {isLoading ? 'Withdrawing...' : ' Withdraw'}
    </Web3Button>
  )
}
