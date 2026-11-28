import { env } from 'node:process'

// Static reads through aliases and globals
const p = process
console.log(p.env.FOO1, globalThis.process.env.FOO2, global.process.env.FOO3)
const {
  env: { FOO4 },
} = process
console.log(FOO4)

// Static reads and checks through optional chains
console.log(
  process?.env?.FOO13,
  globalThis.process?.env?.FOO14,
  process?.env.FOO15,
  process.env?.FOO16,
  globalThis?.process?.env?.FOO17,
  !process?.env,
  typeof process?.env === 'object'
)

// Destructuring assignments whose result isn't consumed
let FOO5, FOO6, FOO18
;({ FOO5 } = process.env)
;(({ FOO6 } = process.env), console.log(FOO5, FOO6))
for ({ FOO18 } = process.env; FOO18; ) {
  break
}

// `process` itself escaping is deliberately not treated as a dynamic `process.env` access
foo(process)
console.log(process.env.FOO7)

// Parenthesized member objects (also what TypeScript casts like `(process.env as any).X` become)
// prettier-ignore
console.log((process.env).FOO19, ((process.env))['FOO20'], (process?.env).FOO21)

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

// Inspecting `process.env` itself without running user code can't read any key
const isProd = process.env && process.env.FOO9 === 'production'
const isObj = typeof process.env === 'object'
const hasEnvVariables = typeof process.env !== 'undefined'
const notNull = process.env != null
const isUndefined = process.env === undefined
function getEnv() {
  if (process.env === void 0) {
    return {}
  }
  return process.env.FOO10
}
const platform =
  typeof process === 'object' && process
    ? (typeof process.env === 'object' && process.env && process.env.FOO11) ||
      process.platform
    : 'posix'
const limit =
  (typeof process !== 'undefined' &&
    typeof process.env !== 'undefined' &&
    process.env.FOO12) ||
  7000
console.log(
  isProd,
  isObj,
  hasEnvVariables,
  notNull,
  isUndefined,
  getEnv,
  platform,
  limit
)

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
