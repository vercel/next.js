import initNext, * as next from './'
import {initPageLoader} from './page-loader'
const {
  buildId,
  assetPrefix
} = window.__NEXT_DATA__

window.next = next
const prefix = assetPrefix || ''
const pageLoader = initPageLoader({buildId, prefix})

initNext({pageLoader})
  .catch((err) => {
    console.error(`${err.message}\n${err.stack}`)
  })
