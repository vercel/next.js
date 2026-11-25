import { log } from './log.js'

// Without async chunk loading, `import.defer()` uses an async module flag module to evaluate async
// modules eagerly.
const lazy = await import.defer('./lazy.js')
const tla = await import.defer('./tla.js')

log.push(`after import.defer: ${log.join(',')}`)
log.push(`lazy: ${lazy.value}, tla: ${tla.value}`)
console.log(log.join('\n'))
