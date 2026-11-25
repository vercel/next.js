// Each "// CASE: " section is analyzed as a separate module.

// CASE: dynamic-computed-destructuring-key-assign
const key = 'env'
let e
;({ [key]: e } = process)
foo(e)

// CASE: dynamic-computed-destructuring-key-rest
const key = 'env'
const {
  [key]: { ...rest },
} = process
foo(rest)

// CASE: dynamic-computed-destructuring-key
const key = 'env'
const { [key]: e } = process
foo(e)

// CASE: dynamic-computed-env-escape
foo(process['env'])

// CASE: dynamic-computed-env-export
export const env = process['env']

// CASE: dynamic-computed-env-variable-key-export
const key = 'env'
export const e = process[key]

// CASE: dynamic-computed-env-variable-key
const key = 'env'
foo(process[key])

// CASE: dynamic-default-import-node
import p from 'node:process'
foo(p.env)

// CASE: dynamic-default-import
import process from 'process'
console.log(process.env[key])

// CASE: dynamic-destructure-computed
const { [dynamic]: value, FOO1 } = process.env
console.log(value, FOO1)

// CASE: dynamic-destructured-env-binding
// Destructuring `env` into a binding is conservatively treated as an escape of `process.env`, like
// `const env = process.env`, even if the binding is only used in statically analyzable ways
const { env } = process
console.log(env.FOO4, 'FOO5' in env)

// CASE: dynamic-destructured-env-default-escape
const { env = {} } = process
foo(env)

// CASE: dynamic-destructured-env-escape
const { env } = process
foo(env)

// CASE: dynamic-destructured-env-expr-target
const obj = {}
;({ env: obj.env } = process)
foo(obj)

// CASE: dynamic-destructured-env-renamed-escape
const { env: e } = process
foo(e)

// CASE: dynamic-destructured-env-rest
const {
  env: { ...rest },
} = process
foo(rest)

// CASE: dynamic-destructured-env-use-before-declaration
// The escaping use precedes the declaration in source order
function getEnv() {
  return env
}

const { env } = process
console.log(getEnv())

// CASE: dynamic-destructuring-assign-result-arg
// A destructuring assignment evaluates to its source, so this hands out all of `process.env`
let FOO1
consume(({ FOO1 } = process.env))

// CASE: dynamic-destructuring-assign-result-init
// A destructuring assignment evaluates to its source, so `env` is all of `process.env`
let FOO1
const env = ({ FOO1 } = process.env)
consume(env)

// CASE: dynamic-destructuring-assign-result-seq
// The last expression of a sequence is its result
let FOO1
consume((0, ({ FOO1 } = process.env)))

// CASE: dynamic-escape-alternative-destructure-key
const key = Math.random() > 0.5 ? 'env' : 'argv'
const { [key]: value } = process
console.log(value)

// CASE: dynamic-escape-alternative-key
const key = Math.random() > 0.5 ? 'env' : 'argv'
console.log(process[key])

// CASE: dynamic-export-destructured-env-shorthand
export const { env } = process

// CASE: dynamic-export-destructured-env
export const { env: e } = process

// CASE: dynamic-export-process-env
export const x = process.env

// CASE: dynamic-fn-default-rest-spread
function readEnv({ FOO1, ...rest } = process.env) {
  return rest
}
console.log(readEnv())

// CASE: dynamic-fn-default
function readEnv(env = process.env) {
  return env.FOO1
}
console.log(readEnv())

// CASE: dynamic-fn-process-env
function foo() {}

foo(process.env)

// CASE: dynamic-global-member
console.log(global.process.env[key])

// CASE: dynamic-globalthis-escape
foo(globalThis.process.env)

// CASE: dynamic-globalthis-member
console.log(globalThis.process.env[key])

// CASE: dynamic-has-own-property-computed-method
const method = 'hasOwnProperty'
export function has(key) {
  return process.env[method](key)
}

// CASE: dynamic-has-own-property-spread
export const has = process.env.hasOwnProperty(...keys)

// CASE: dynamic-has-own-property
export function has(key) {
  return process.env.hasOwnProperty(key)
}

// CASE: dynamic-in
console.log(dynamic in process.env)

// CASE: dynamic-logical-and-env-escape
// The right side of `&&` becomes the result
const env = typeof process !== 'undefined' && process.env
console.log(env)

// CASE: dynamic-logical-env-escape
const env = process.env || {}
console.log(env)

// CASE: dynamic-loose-eq-env
// Loose equality with a non-nullish operand can call `valueOf`/`toString`/`Symbol.toPrimitive`
// on `process.env`, which could read arbitrary keys
const same = process.env == 'x'
console.log(same)

// CASE: dynamic-member
console.log(process.env[dynamic])

// CASE: dynamic-named-import-escape
import { env } from 'node:process'
import { env as e } from 'process'

foo(env)
bar({ e })

// CASE: dynamic-named-import-reexport
import { env } from 'process'

export { env }

// CASE: dynamic-namespace-import-escape
import * as p from 'process'

foo(p.env)

// CASE: dynamic-namespace-import-member
import * as p from 'node:process'

console.log(p.env[key])

// CASE: dynamic-optional-chain-destructure-key
const { [key]: value } = process?.env
console.log(value)

// CASE: dynamic-optional-chain-destructure
const { FOO } = process?.env
console.log(FOO)

// CASE: dynamic-optional-chain-escape
foo(process?.env)

// CASE: dynamic-optional-chain-in-key
console.log(key in process?.env)

// CASE: dynamic-optional-chain-in
console.log('FOO' in process?.env)

// CASE: dynamic-optional-chain-member
console.log(process?.env?.[key])

// CASE: dynamic-optional-method-call
// Optional calls aren't analyzed as calls, so a method called optionally on `process.env` (which
// receives it as `this`) is treated as an escape
console.log(process.env.hasOwnProperty?.(String(Math.random())))

// CASE: dynamic-paren-escape
// Parentheses around `process.env` don't change that it escapes here
// prettier-ignore
foo((process.env))

// CASE: dynamic-process-alias-destructure
const p = process
const { [dynamic]: value } = p.env
console.log(value)

// CASE: dynamic-process-alias-escape
const p = process
foo(p.env)
export const env = p.env

// CASE: dynamic-process-alias-in
const p = process
console.log(dynamic in p.env)

// CASE: dynamic-process-alias
const p = process
console.log(p.env[dynamic])

// CASE: dynamic-property-is-enumerable
const key = Math.random() > 0.5 ? 'FOO1' : String(Math.random())
console.log(process.env.propertyIsEnumerable(key))

// CASE: dynamic-rest-spread
const { FOO1, ...rest } = process.env

// CASE: dynamic-value-of-call
console.log(Object.prototype.valueOf.call(process.env))

// CASE: dynamic-value-of
// `valueOf` returns `process.env` itself
const env = process.env.valueOf()
console.log(env[Math.random()])
