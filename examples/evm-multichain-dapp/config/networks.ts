import { ChainId } from './chainIds'

const Arbitrum =
  'https://raw.githubusercontent.com/sushiswap/icons/master/network/arbitrum.jpg'
const Avalanche =
  'https://raw.githubusercontent.com/sushiswap/icons/master/network/avalanche.jpg'
const Bsc =
  'https://raw.githubusercontent.com/sushiswap/icons/master/network/bsc.jpg'
const Fantom =
  'https://raw.githubusercontent.com/sushiswap/icons/master/network/fantom.jpg'
const Goerli =
  'https://raw.githubusercontent.com/sushiswap/icons/master/network/goerli.jpg'
const Harmony =
  'https://raw.githubusercontent.com/sushiswap/icons/master/network/harmonyone.jpg'
const Heco =
  'https://raw.githubusercontent.com/sushiswap/icons/master/network/heco.jpg'
const Kovan =
  'https://raw.githubusercontent.com/sushiswap/icons/master/network/kovan.jpg'
const Mainnet =
  'https://raw.githubusercontent.com/sushiswap/icons/master/network/mainnet.jpg'
const Matic =
  'https://raw.githubusercontent.com/sushiswap/icons/master/network/polygon.jpg'
const Moonbeam =
  'https://raw.githubusercontent.com/sushiswap/icons/master/network/moonbeam.jpg'
const OKEx =
  'https://raw.githubusercontent.com/sushiswap/icons/master/network/okex.jpg'
const Polygon =
  'https://raw.githubusercontent.com/sushiswap/icons/master/network/polygon.jpg'
const Rinkeby =
  'https://raw.githubusercontent.com/sushiswap/icons/master/network/rinkeby.jpg'
const Ropsten =
  'https://raw.githubusercontent.com/sushiswap/icons/master/network/ropsten.jpg'
const xDai =
  'https://raw.githubusercontent.com/sushiswap/icons/master/network/xdai.jpg'
const Celo =
  'https://raw.githubusercontent.com/sushiswap/icons/master/network/celo.jpg'
const Palm =
  'https://raw.githubusercontent.com/sushiswap/icons/master/network/palm.jpg'
const Moonriver =
  'https://raw.githubusercontent.com/sushiswap/icons/master/network/moonriver.jpg'
const Fuse =
  'https://raw.githubusercontent.com/sushiswap/icons/master/token/fuse.jpg'
const Telos =
  'https://raw.githubusercontent.com/sushiswap/logos/main/network/telos/0xD102cE6A4dB07D247fcc28F366A623Df0938CA9E.jpg'

export const NETWORK_ICON = {
  [ChainId.ETHEREUM]: Mainnet,
  [ChainId.ROPSTEN]: Ropsten,
  [ChainId.RINKEBY]: Rinkeby,
  [ChainId.GÖRLI]: Goerli,
  [ChainId.KOVAN]: Kovan,
  [ChainId.FANTOM]: Fantom,
  [ChainId.FANTOM_TESTNET]: Fantom,
  [ChainId.BSC]: Bsc,
  [ChainId.BSC_TESTNET]: Bsc,
  [ChainId.MATIC]: Polygon,
  [ChainId.MATIC_TESTNET]: Matic,
  [ChainId.XDAI]: xDai,
  [ChainId.ARBITRUM]: Arbitrum,
  [ChainId.MOONBEAM_TESTNET]: Moonbeam,
  [ChainId.AVALANCHE]: Avalanche,
  [ChainId.AVALANCHE_TESTNET]: Avalanche,
  [ChainId.HECO]: Heco,
  [ChainId.HECO_TESTNET]: Heco,
  [ChainId.HARMONY]: Harmony,
  [ChainId.HARMONY_TESTNET]: Harmony,
  [ChainId.OKEX]: OKEx,
  [ChainId.OKEX_TESTNET]: OKEx,
  [ChainId.CELO]: Celo,
  [ChainId.PALM]: Palm,
  [ChainId.MOONRIVER]: Moonriver,
  [ChainId.FUSE]: Fuse,
  [ChainId.TELOS]: Telos,
}

export const NETWORK_LABEL: { [chainId in ChainId]?: string } = {
  [ChainId.ETHEREUM]: 'Ethereum',
  [ChainId.RINKEBY]: 'Rinkeby',
  [ChainId.ROPSTEN]: 'Ropsten',
  [ChainId.GÖRLI]: 'Görli',
  [ChainId.KOVAN]: 'Kovan',
  [ChainId.FANTOM]: 'Fantom',
  [ChainId.FANTOM_TESTNET]: 'Fantom Testnet',
  [ChainId.MATIC]: 'Polygon',
  [ChainId.MATIC_TESTNET]: 'Polygon Testnet',
  [ChainId.XDAI]: 'xDai',
  [ChainId.ARBITRUM]: 'Arbitrum',
  [ChainId.BSC]: 'BSC',
  [ChainId.BSC_TESTNET]: 'BSC Testnet',
  [ChainId.MOONBEAM_TESTNET]: 'Moonbase',
  [ChainId.AVALANCHE]: 'Avalanche',
  [ChainId.AVALANCHE_TESTNET]: 'Fuji',
  [ChainId.HECO]: 'HECO',
  [ChainId.HECO_TESTNET]: 'HECO Testnet',
  [ChainId.HARMONY]: 'Harmony',
  [ChainId.HARMONY_TESTNET]: 'Harmony Testnet',
  [ChainId.OKEX]: 'OKEx',
  [ChainId.OKEX_TESTNET]: 'OKEx',
  [ChainId.CELO]: 'Celo',
  [ChainId.PALM]: 'Palm',
  [ChainId.MOONRIVER]: 'Moonriver',
  [ChainId.FUSE]: 'Fuse',
  [ChainId.TELOS]: 'Telos EVM',
}
