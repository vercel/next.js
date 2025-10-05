import { register } from 'module'

// Load relative to the current file
register('./hook.mjs', import.meta.url)
// Load from a bare specifier
register('test-pkg')
// Load with parentURL in options object
register('./hook.mjs', { parentURL: import.meta.url })
