/* global fixture, test */
import 'testcafe'

import fs from 'fs-extra'
import { join } from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = join(__dirname, '../')
const nextConfigPath = join(appDir, 'next.config.js')

const cleanUp = () => fs.remove(nextConfigPath)

fixture('Serverless runtime configs')
  .before(() => cleanUp())
  .after(() => cleanUp())

test('should error on usage of publicRuntimeConfig', async t => {
  await fs.writeFile(
    nextConfigPath,
    `module.exports = {
    target: 'serverless',
    publicRuntimeConfig: {
      hello: 'world'
    }
  }`
  )

  const { stderr } = await nextBuild(appDir, undefined, { stderr: true })
  await t
    .expect(stderr)
    .match(/Cannot use publicRuntimeConfig or serverRuntimeConfig/)
})

test('should error on usage of serverRuntimeConfig', async t => {
  await fs.writeFile(
    nextConfigPath,
    `module.exports = {
    target: 'serverless',
    serverRuntimeConfig: {
      hello: 'world'
    }
  }`
  )

  const { stderr } = await nextBuild(appDir, undefined, { stderr: true })
  await t
    .expect(stderr)
    .match(/Cannot use publicRuntimeConfig or serverRuntimeConfig/)
})
