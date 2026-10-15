import { trace, meet } from './barrier.mjs'
trace.push('a:start')
await meet()
trace.push('a:end')
