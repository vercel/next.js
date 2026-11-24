import { env } from 'node:process'
// Not the `process` module
import { env as otherEnv } from './config'

// Existence checks of process.env
console.log(process.env.hasOwnProperty('FOO_METHOD'))
console.log(env.hasOwnProperty('FOO_IMPORT'))
const aliasedEnv = process.env
console.log(aliasedEnv.hasOwnProperty('FOO_ALIAS'))
console.log(Object.hasOwn(process.env, 'FOO_OBJECT_HAS_OWN'))
const { hasOwn } = Object
console.log(hasOwn(env, 'FOO_OBJECT_HAS_OWN_EXTRACTED'))
console.log(
  Object.prototype.hasOwnProperty.call(process.env, 'FOO_PROTOTYPE_CALL')
)
console.log(process.env.hasOwnProperty.call(process.env, 'FOO_METHOD_CALL'))
const { hasOwnProperty } = process.env
console.log(hasOwnProperty.call(env, 'FOO_DESTRUCTURED_CALL'))
// prettier-ignore
console.log((0, process.env.hasOwnProperty).call(process.env, 'FOO_COMMA_METHOD_CALL'))
console.log(process.env.propertyIsEnumerable('FOO_ENUMERABLE'))
console.log(
  Object.prototype.propertyIsEnumerable.call(process.env, 'FOO_ENUMERABLE_CALL')
)

// Not existence checks of process.env
console.log(otherEnv.hasOwnProperty('NOT_ENV_OTHER_IMPORT'))
const other = { NOT_ENV_OTHER: 1 }
console.log(Object.hasOwn(other, 'NOT_ENV_OBJECT_HAS_OWN'))
console.log(Object.prototype.hasOwnProperty.call(other, 'NOT_ENV_CALL'))
console.log(process.env.hasOwnProperty.call(other, 'NOT_ENV_METHOD_CALL'))
// These throw, there is no receiver
console.log(hasOwnProperty('NOT_ENV_DETACHED'))
const call = Object.prototype.hasOwnProperty.call
console.log(call(process.env, 'NOT_ENV_DETACHED_CALL'))
// This throws too, but the analyzer treats `(0, obj.method)(...)` like `obj.method(...)`, so
// it is still listed (an unnecessary, but harmless dependency)
console.log((0, process.env.hasOwnProperty)('COMMA_CALL_THROWS'))
