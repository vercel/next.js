// Computed keys that are statically known don't make the module read all env vars
const key = 'FOO2'
console.log(process.env['FOO1'], process.env[key])

if ('FOO3' in process.env) {
  console.log('exists')
}

const { ['FOO4']: foo4, FOO5 } = process.env
console.log(foo4, FOO5)

// Computed access on other objects is unrelated
const obj = {}
console.log(obj[dynamic], dynamic in obj)

// Computed keys on `process` that aren't `env`
const versionKey = 'version'
foo(process[versionKey])
foo(process['platform'])
const { [versionKey]: v } = process
foo(v)

// A computed `env` key that is only destructured further
const {
  ['env']: { FOO6 },
} = process
console.log(FOO6)

// `env` from an unrelated object
export const { env } = config
