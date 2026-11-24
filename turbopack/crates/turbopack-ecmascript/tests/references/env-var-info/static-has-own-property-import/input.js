import { env } from 'node:process'
// Not the `process` module
import { env as otherEnv } from './config'

console.log(env.hasOwnProperty('FOO1'), otherEnv.hasOwnProperty('NOT_ENV'))
