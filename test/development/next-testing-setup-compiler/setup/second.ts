import { order } from './state'
if (order.join(',') !== 'configured-alias,configured-loader,first')
  throw new Error('setup order incorrect')
await Promise.resolve()
order.push('second')
