if (process.env.FOO1 === 'x') {
  return false
}

if ('FOO2' in process.env) {
  return true
}

const { FOO3 } = process.env
console.log(FOO3)

const NAME = 'FOO4'
console.log(process.env[NAME])

// ---

// Assigning process.env
const env = process.env
if (env.FOO5 === 'x') {
  return false
}
if ('FOO6' in env) {
  return true
}

// ---

// Assigning process
const p = process
if (p.env.FOO7 === 'x') {
  return false
}
if ('FOO8' in p.env) {
  return true
}

// ---

// Assigning process with indirection
const p1 = p
if (p1.env.FOO9 === 'x') {
  return false
}
if ('FOO10' in p1.env) {
  return true
}

// ---

// e2e test for a common pattern
if (
  typeof process === 'object' &&
  process &&
  process.env &&
  process.env.FOO11 !== 'development'
) {
  console.log('hi')
}
