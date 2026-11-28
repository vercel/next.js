import process from 'process'
import * as p from 'node:process'
import { env } from 'node:process'
// Not the `process` module
import { env as otherEnv } from './config'

console.log(process.env.FOO1, p.env.FOO2, env.FOO3, 'FOO4' in env)
console.log(env.hasOwnProperty('FOO5'), otherEnv.hasOwnProperty(key))
foo(otherEnv)
// Parenthesized member objects are still static reads
// prettier-ignore
console.log((env).FOO6, (p.env).FOO7)
