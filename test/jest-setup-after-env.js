/* eslint-env jest */

if (process.env.JEST_RETRY_TIMES) {
  const retries = Number(process.env.JEST_RETRY_TIMES)
  console.log(`Configuring jest retries: ${retries}`)
  jest.retryTimes(retries)
}
