import { test } from './util.js'
import { topValue } from './async_module.js'
import './side-effect.js'
import { value, processData } from './nested_async.js'
import { chainedValue } from './chained_async.js'

// This module has top-level await via its async_module dependency,
// which triggers Turbopack's async module wrapper.
// The wrapper should use a regular function (not async function) when
// targeting environments without native async support (e.g. chrome 41).
const result = test()
console.log(result)
console.log(topValue)

// nested_async.js: tests multiple top-level awaits + user async functions
console.log(value)
processData()

// chained_async.js: tests async dependency chain
console.log(chainedValue)
