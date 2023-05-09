import { useEffect, useState, useRef } from 'react'
import Web3 from 'web3'
import { useWeb3React } from '@web3-react/core'
import RPC from '../config/rpc'

/**
 * Provides a web3 instance using the provider provided by useWallet
 * with a fallback of an httpProver
 * Recreate web3 instance only if the provider change
 */
const useWeb3 = () => {
  const { library, chainId = 1 } = useWeb3React()
  const refEth = useRef(library)

  const [web3, setweb3] = useState(
    library
      ? new Web3(library)
      : // @ts-ignore TYPE NEEDS FIXING
        new Web3(RPC[chainId])
  )

  useEffect(() => {
    if (library !== refEth.current) {
      setweb3(
        library
          ? new Web3(library)
          : // @ts-ignore TYPE NEEDS FIXING
            new Web3(RPC[chainId])
      )
      refEth.current = library
    }
  }, [library, setweb3, chainId])

  return { web3, setweb3 }
}

export default useWeb3
