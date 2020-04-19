// @ts-check
/* global jasmine */
/* eslint-env jest */
import * as fs from 'fs-extra'
import { findPort, killApp, launchApp, waitFor } from 'next-test-utils'
import webdriver from 'next-webdriver'
import * as path from 'path'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

function getCollections() {
  return fs
    .readdirSync(__dirname)
    .map(entry => ({ entry, stats: fs.statSync(path.join(__dirname, entry)) }))
    .filter(({ stats }) => stats.isDirectory())
    .map(({ entry }) => entry)
}

/**
 * @param {string} collection
 */
function getBehaviors(collection) {
  const collectionDir = path.join(__dirname, collection)
  return fs
    .readdirSync(collectionDir)
    .map(entry => ({
      entry,
      stats: fs.statSync(path.join(collectionDir, entry)),
    }))
    .filter(({ stats }) => stats.isDirectory())
    .map(({ entry }) => entry)
    .sort()
}
/**
 * @param {string} collection
 * * @param {string} behavior
 * * @param {number} step
 */
function getFilesByStep(collection, behavior, step) {
  const behaviorDir = path.join(__dirname, collection, behavior)
  return fs
    .readdirSync(behaviorDir)
    .filter(entry => entry.startsWith(`${step}.`))
    .sort()
}

describe('Acceptance Tests', () => {
  const collections = getCollections()

  collections.forEach(collection => {
    describe(collection, () => {
      const behaviors = getBehaviors(collection)

      behaviors.forEach(behavior => {
        describe(behavior, () => {
          const root = path.join(__dirname, collection, behavior)
          const cwd = path.join(root, '__tmp__')

          afterEach(async () => {
            await waitFor(750)
          })

          test('setup: filesystem', async () => {
            await fs.remove(cwd)

            const pages = path.join(cwd, 'pages')
            await fs.mkdirp(pages)
            await fs.writeFile(
              path.join(pages, 'index.js'),
              `export { default } from '../index';`
            )
            await fs.writeFile(
              path.join(cwd, 'index.js'),
              `export default () => '';`
            )
          })

          let appPort
          let app
          /** @type {import('next-webdriver').Chain} */
          let browser
          test('setup: app', async () => {
            appPort = await findPort()
            app = await launchApp(cwd, appPort)
            browser = await webdriver(appPort, '/')
          })

          for (let step = 0; ; ++step) {
            const files = getFilesByStep(collection, behavior, step)
            if (files.length < 1) {
              break
            }

            let acceptance
            test(`step ${step}: copy files`, async () => {
              for (const fileName of files) {
                const targetFile = fileName.replace(/^(\d+\.)+/, '')

                const content = await fs.readFile(
                  path.join(root, fileName),
                  'utf8'
                )

                if (targetFile === 'acceptance.json') {
                  acceptance = JSON.parse(content)
                  continue
                }

                const targetPath = path.join(cwd, targetFile)
                if (content.trim() === '') {
                  await fs.remove(targetPath)
                  continue
                }
                await fs.writeFile(targetPath, content)
              }

              // TODO: way to wait for refresh: monitor network?
            })

            // TODO: reload assertion

            /** @param browser {import('next-webdriver').Chain} */
            async function onAction(browser, { selector, action }) {
              if (action === 'click') {
                await browser.elementByCss(selector).click()
              } else {
                throw new Error(`Unknown acceptance action: ${action}`)
              }
            }

            /** @param browser {import('next-webdriver').Chain} */
            async function onDom(browser, { selector, ...rest }) {
              if ('toBe' in rest) {
                expect(await browser.elementByCss(selector).text()).toBe(
                  rest.toBe
                )
              } else if ('stringContaining' in rest) {
                expect(
                  await browser.elementByCss(selector).text()
                  // @ts-ignore
                ).toMatch(rest.stringContaining)
              } else {
                throw new Error(
                  `Unknown DOM assertion: ${JSON.stringify(rest, null, ' ')}`
                )
              }
            }

            // eslint-disable-next-line no-loop-func
            test(`step ${step}: before:actions`, async () => {
              if (acceptance && acceptance['before:actions']) {
                for (const action of acceptance['before:actions']) {
                  await onAction(browser, action)
                }
              }
            })

            // eslint-disable-next-line no-loop-func
            test(`step ${step}: dom assertions`, async () => {
              if (acceptance && acceptance['dom']) {
                for (const dom of acceptance['dom']) {
                  await onDom(browser, dom)
                }
              }
            })

            // eslint-disable-next-line no-loop-func
            test(`step ${step}: after:actions`, async () => {
              if (acceptance && acceptance['after:actions']) {
                for (const action of acceptance['after:actions']) {
                  await onAction(browser, action)
                }
              }
            })
          }

          test('teardown: app', async () => {
            await browser.close()
            await killApp(app)
          })
        })
      })
    })
  })
})
