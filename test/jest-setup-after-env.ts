// A default max-timeout of 1 minute is allowed
// we should aim to bring this down though

if (process.env.CI) {
  // give an extra 30 seconds in CI for slower resources
  jest.setTimeout(90 * 1000)
} else {
  jest.setTimeout(60 * 1000)
}
