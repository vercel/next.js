/* eslint-env jest */
const expectPuppeteer = require('expect-puppeteer')

const timeout = 1000 * 60

jest.setTimeout(timeout)
expectPuppeteer.setDefaultOptions({ timeout })

module.exports = expectPuppeteer
