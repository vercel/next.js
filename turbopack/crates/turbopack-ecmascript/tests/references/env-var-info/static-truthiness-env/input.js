import { env } from 'node:process'

if (process.env) {
  console.log(process.env.FOO1)
}
const a = !process.env
const b = Boolean(process.env)
const c = process.env ? 'yes' : 'no'
if (globalThis.process.env && env) {
  console.log('ok')
}
