import { setTimeout } from 'node:timers/promises'
console.log('messages :: imported, sleeping')
await setTimeout(500)
console.log('messages :: ready')
export default { title: 'hello' }
