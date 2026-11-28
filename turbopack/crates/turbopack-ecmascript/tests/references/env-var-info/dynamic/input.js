// Each "// CASE: " section is analyzed as a separate module.
// Functions isolate local bindings; import/export cases use unique module-level bindings.

// CASE: dynamic-computed-destructuring-key-assign
function dynamic_computed_destructuring_key_assign() {
  const key = 'env'
  let e
  ;({ [key]: e } = process)
  foo(e)
}

// CASE: dynamic-computed-destructuring-key-rest
function dynamic_computed_destructuring_key_rest() {
  const key = 'env'
  const {
    [key]: { ...rest },
  } = process
  foo(rest)
}

// CASE: dynamic-computed-destructuring-key
function dynamic_computed_destructuring_key() {
  const key = 'env'
  const { [key]: e } = process
  foo(e)
}

// CASE: dynamic-computed-env-escape
function dynamic_computed_env_escape() {
  foo(process['env'])
}

// CASE: dynamic-computed-env-export
export const computedEnvExport = process['env']

// CASE: dynamic-computed-env-variable-key-export
const exportKey = 'env'
export const computedEnvVariableExport = process[exportKey]

// CASE: dynamic-computed-env-variable-key
function dynamic_computed_env_variable_key() {
  const key = 'env'
  foo(process[key])
}

// CASE: dynamic-default-import-node
import nodeProcessDefault from 'node:process'
foo(nodeProcessDefault.env)

// CASE: dynamic-default-import
import processDefault from 'process'
console.log(processDefault.env[key])

// CASE: dynamic-destructure-computed
function dynamic_destructure_computed() {
  const { [dynamic]: value, FOO1 } = process.env
  console.log(value, FOO1)
}

// CASE: dynamic-destructured-env-binding
function dynamic_destructured_env_binding() {
  // Destructuring `env` into a binding is conservatively treated as an escape of `process.env`, like
  // `const env = process.env`, even if the binding is only used in statically analyzable ways
  const { env } = process
  console.log(env.FOO4, 'FOO5' in env)
}

// CASE: dynamic-destructured-env-default-escape
function dynamic_destructured_env_default_escape() {
  const { env = {} } = process
  foo(env)
}

// CASE: dynamic-destructured-env-escape
function dynamic_destructured_env_escape() {
  const { env } = process
  foo(env)
}

// CASE: dynamic-destructured-env-expr-target
function dynamic_destructured_env_expr_target() {
  const obj = {}
  ;({ env: obj.env } = process)
  foo(obj)
}

// CASE: dynamic-destructured-env-renamed-escape
function dynamic_destructured_env_renamed_escape() {
  const { env: e } = process
  foo(e)
}

// CASE: dynamic-destructured-env-rest
function dynamic_destructured_env_rest() {
  const {
    env: { ...rest },
  } = process
  foo(rest)
}

// CASE: dynamic-destructured-env-use-before-declaration
function dynamic_destructured_env_use_before_declaration() {
  // The escaping use precedes the declaration in source order
  function getEnv() {
    return env
  }

  const { env } = process
  console.log(getEnv())
}

// CASE: dynamic-destructuring-assign-result-arg
function dynamic_destructuring_assign_result_arg() {
  // A destructuring assignment evaluates to its source, so this hands out all of `process.env`
  let FOO1
  consume(({ FOO1 } = process.env))
}

// CASE: dynamic-destructuring-assign-result-init
function dynamic_destructuring_assign_result_init() {
  // A destructuring assignment evaluates to its source, so `env` is all of `process.env`
  let FOO1
  const env = ({ FOO1 } = process.env)
  consume(env)
}

// CASE: dynamic-destructuring-assign-result-seq
function dynamic_destructuring_assign_result_seq() {
  // The last expression of a sequence is its result
  let FOO1
  consume((0, ({ FOO1 } = process.env)))
}

// CASE: dynamic-escape-alternative-destructure-key
function dynamic_escape_alternative_destructure_key() {
  const key = Math.random() > 0.5 ? 'env' : 'argv'
  const { [key]: value } = process
  console.log(value)
}

// CASE: dynamic-escape-alternative-key
function dynamic_escape_alternative_key() {
  const key = Math.random() > 0.5 ? 'env' : 'argv'
  console.log(process[key])
}

// CASE: dynamic-export-destructured-env-shorthand
export const { env } = process

// CASE: dynamic-export-destructured-env
export const { env: exportedEnvRenamed } = process

// CASE: dynamic-export-process-env
export const x = process.env

// CASE: dynamic-fn-default-rest-spread
function dynamic_fn_default_rest_spread() {
  function readEnv({ FOO1, ...rest } = process.env) {
    return rest
  }
  console.log(readEnv())
}

// CASE: dynamic-fn-default
function dynamic_fn_default() {
  function readEnv(env = process.env) {
    return env.FOO1
  }
  console.log(readEnv())
}

// CASE: dynamic-fn-process-env
function dynamic_fn_process_env() {
  function foo() {}

  foo(process.env)
}

// CASE: dynamic-global-member
function dynamic_global_member() {
  console.log(global.process.env[key])
}

// CASE: dynamic-globalthis-escape
function dynamic_globalthis_escape() {
  foo(globalThis.process.env)
}

// CASE: dynamic-globalthis-member
function dynamic_globalthis_member() {
  console.log(globalThis.process.env[key])
}

// CASE: dynamic-has-own-property-computed-method
const method = 'hasOwnProperty'
export function hasComputed(key) {
  return process.env[method](key)
}

// CASE: dynamic-has-own-property-spread
export const hasSpread = process.env.hasOwnProperty(...keys)

// CASE: dynamic-has-own-property
export function has(key) {
  return process.env.hasOwnProperty(key)
}

// CASE: dynamic-in
function dynamic_in() {
  console.log(dynamic in process.env)
}

// CASE: dynamic-logical-and-env-escape
function dynamic_logical_and_env_escape() {
  // The right side of `&&` becomes the result
  const env = typeof process !== 'undefined' && process.env
  console.log(env)
}

// CASE: dynamic-logical-env-escape
function dynamic_logical_env_escape() {
  const env = process.env || {}
  console.log(env)
}

// CASE: dynamic-loose-eq-env
function dynamic_loose_eq_env() {
  // Loose equality with a non-nullish operand can call `valueOf`/`toString`/`Symbol.toPrimitive`
  // on `process.env`, which could read arbitrary keys
  const same = process.env == 'x'
  console.log(same)
}

// CASE: dynamic-member
function dynamic_member() {
  console.log(process.env[dynamic])
}

// CASE: dynamic-named-import-escape
import { env as importedEnvEscape } from 'node:process'
import { env as importedEnvAliasEscape } from 'process'

foo(importedEnvEscape)
bar({ importedEnvAliasEscape })

// CASE: dynamic-named-import-reexport
import { env as importedEnvReexport } from 'process'

export { importedEnvReexport }

// CASE: dynamic-namespace-import-escape
import * as processNamespaceEscape from 'process'

foo(processNamespaceEscape.env)

// CASE: dynamic-namespace-import-member
import * as processNamespaceMember from 'node:process'

console.log(processNamespaceMember.env[key])

// CASE: dynamic-optional-chain-destructure-key
function dynamic_optional_chain_destructure_key() {
  const { [key]: value } = process?.env
  console.log(value)
}

// CASE: dynamic-optional-chain-destructure
function dynamic_optional_chain_destructure() {
  const { FOO } = process?.env
  console.log(FOO)
}

// CASE: dynamic-optional-chain-escape
function dynamic_optional_chain_escape() {
  foo(process?.env)
}

// CASE: dynamic-optional-chain-in-key
function dynamic_optional_chain_in_key() {
  console.log(key in process?.env)
}

// CASE: dynamic-optional-chain-in
function dynamic_optional_chain_in() {
  console.log('FOO' in process?.env)
}

// CASE: dynamic-optional-chain-member
function dynamic_optional_chain_member() {
  console.log(process?.env?.[key])
}

// CASE: dynamic-optional-method-call
function dynamic_optional_method_call() {
  // Optional calls aren't analyzed as calls, so a method called optionally on `process.env` (which
  // receives it as `this`) is treated as an escape
  console.log(process.env.hasOwnProperty?.(String(Math.random())))
}

// CASE: dynamic-paren-escape
function dynamic_paren_escape() {
  // Parentheses around `process.env` don't change that it escapes here
  // prettier-ignore
  foo((process.env))
}

// CASE: dynamic-process-alias-destructure
function dynamic_process_alias_destructure() {
  const p = process
  const { [dynamic]: value } = p.env
  console.log(value)
}

// CASE: dynamic-process-alias-escape
const exportedProcessAlias = process
foo(exportedProcessAlias.env)
export const exportedAliasEnv = exportedProcessAlias.env

// CASE: dynamic-process-alias-in
function dynamic_process_alias_in() {
  const p = process
  console.log(dynamic in p.env)
}

// CASE: dynamic-process-alias
function dynamic_process_alias() {
  const p = process
  console.log(p.env[dynamic])
}

// CASE: dynamic-property-is-enumerable
function dynamic_property_is_enumerable() {
  const key = Math.random() > 0.5 ? 'FOO1' : String(Math.random())
  console.log(process.env.propertyIsEnumerable(key))
}

// CASE: dynamic-rest-spread
function dynamic_rest_spread() {
  const { FOO1, ...rest } = process.env
}

// CASE: dynamic-value-of-call
function dynamic_value_of_call() {
  console.log(Object.prototype.valueOf.call(process.env))
}

// CASE: dynamic-value-of
function dynamic_value_of() {
  // `valueOf` returns `process.env` itself
  const env = process.env.valueOf()
  console.log(env[Math.random()])
}
