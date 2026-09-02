// e2e test for a common pattern
if (
  typeof process === 'object' &&
  process &&
  process.env &&
  process.env.FOO1 !== 'development'
) {
  console.log('hi')
}
