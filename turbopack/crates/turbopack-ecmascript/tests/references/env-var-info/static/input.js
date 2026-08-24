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

// e2e test for a common pattern
if (
  typeof process === 'object' &&
  process &&
  process.env &&
  process.env.FOO5 !== 'development'
) {
  console.log('hi')
}
