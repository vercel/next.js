import { trace, meet } from './barrier.mjs'
trace.push('b:start')
await meet()
trace.push('b:end')
