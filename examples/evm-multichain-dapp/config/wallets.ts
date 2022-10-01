import { ChainId } from './chainIds'

import { InjectedConnector } from '@web3-react/injected-connector'

export const supportedChainIds = Object.values(ChainId) as number[]

export const injected = new InjectedConnector({
  supportedChainIds,
})

export const wallets = [
  {
    name: 'Injected',
    connector: injected,
    logo: 'https://cdn.iconscout.com/icon/free/png-256/metamask-2728406-2261817.png',
  },
]
