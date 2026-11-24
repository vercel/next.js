import { env } from 'node:process'

// Static reads through aliases and globals
const p = process
console.log(p.env.FOO1, globalThis.process.env.FOO2, global.process.env.FOO3)
const {
  env: { FOO4 },
} = process
console.log(FOO4)

// Destructuring assignments whose result isn't consumed
let FOO5, FOO6
;({ FOO5 } = process.env)
;(({ FOO6 } = process.env), console.log(FOO5, FOO6))

// `process` itself escaping is deliberately not treated as a dynamic `process.env` access
foo(process)
console.log(process.env.FOO7)

// Truthiness checks of `process.env` itself can't read any key
if (process.env) {
  console.log(process.env.FOO8)
}
const notEnv = !process.env
const hasEnv = Boolean(process.env)
const envTernary = process.env ? 'yes' : 'no'
if (globalThis.process.env && env) {
  console.log('ok')
}

// These aren't the global `process`
function shadowedParam(process) {
  return foo(process.env)
}

function shadowedLocal() {
  const process = { env: {} }
  return process.env[key]
}

// `env` from an unrelated object
const { env: configEnv } = config
foo(configEnv)

console.log(notEnv, hasEnv, envTernary, shadowedParam, shadowedLocal)
