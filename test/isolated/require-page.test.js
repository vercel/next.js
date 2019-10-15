/* global fixture, test */
import 'testcafe'

import { join } from 'path'
import { SERVER_DIRECTORY, CLIENT_STATIC_FILES_PATH } from 'next/constants'
import {
  requirePage,
  getPagePath,
  pageNotFoundError
} from 'next/dist/next-server/server/require'
import { normalizePagePath } from 'next/dist/next-server/server/normalize-page-path'
import { didThrow } from 'next-test-utils'

const sep = '/'
const distDir = join(__dirname, '_resolvedata')
const pathToBundles = join(
  distDir,
  SERVER_DIRECTORY,
  CLIENT_STATIC_FILES_PATH,
  'development',
  'pages'
)

fixture('pageNotFoundError')

test('Should throw error with ENOENT code', async t => {
  let errCode
  try {
    throw pageNotFoundError('test')
  } catch (err) {
    errCode = err.code
  }
  await t.expect(errCode).eql('ENOENT')
})

test('Should turn / into /index', async t => {
  await t.expect(normalizePagePath('/')).eql(`${sep}index`)
})

test('Should turn _error into /_error', async t => {
  await t.expect(normalizePagePath('_error')).eql(`${sep}_error`)
})

test('Should turn /abc into /abc', async t => {
  await t.expect(normalizePagePath('/abc')).eql(`${sep}abc`)
})

test('Should turn /abc/def into /abc/def', async t => {
  await t.expect(normalizePagePath('/abc/def')).eql(`${sep}abc${sep}def`)
})

test('Should throw on /../../test.js', async t => {
  await didThrow(() => normalizePagePath('/../../test.js'), true)
})

test('Should append /index to the / page', async t => {
  const pagePath = getPagePath('/', distDir)
  await t.expect(pagePath).eql(join(pathToBundles, `${sep}index.js`))
})

test('Should prepend / when a page does not have it', async t => {
  const pagePath = getPagePath('_error', distDir)
  await t.expect(pagePath).eql(join(pathToBundles, `${sep}_error.js`))
})

test('Should throw with paths containing ../', async t => {
  await didThrow(() => getPagePath('/../../package.json', distDir), true)
})

test('Should require /index.js when using /', async t => {
  const page = await requirePage('/', distDir)
  await t.expect(page.test).eql('hello')
})

test('Should require /index.js when using /index', async t => {
  const page = await requirePage('/index', distDir)
  await t.expect(page.test).eql('hello')
})

test('Should require /world.js when using /world', async t => {
  const page = await requirePage('/world', distDir)
  await t.expect(page.test).eql('world')
})

test('Should throw when using /../../test.js', async t => {
  try {
    await requirePage('/../../test', distDir)
  } catch (err) {
    await t.expect(err.code).eql('ENOENT')
  }
})

test('Should throw when using non existent pages like /non-existent.js', async t => {
  try {
    await requirePage('/non-existent', distDir)
  } catch (err) {
    await t.expect(err.code).eql('ENOENT')
  }
})

test('Should bubble up errors in the child component', async t => {
  let errCode
  try {
    await requirePage('/non-existent-child', distDir)
  } catch (err) {
    errCode = err.code
  }
  await t.expect(errCode).eql('MODULE_NOT_FOUND')
})
