import { nextTestSetup } from 'e2e-utils'
import { getBrowserBodyText, retry } from 'next-test-utils'
import fs from 'fs-extra'
import path from 'path'
import { type Playwright } from 'next-webdriver'

const READ_ONLY_PERMISSIONS = 0o444
const READ_WRITE_PERMISSIONS = 0o644

let pageHello = 'pages/hello.js'

describe('Read-only source HMR', () => {
  const { next } = nextTestSetup({
    files: path.join(__dirname, '..'),
    skipStart: true,
    env: {
      __NEXT_TEST_WITH_DEVTOOL: '1',
      // Events can be finicky in CI. This switches to a more reliable
      // polling method.
      CHOKIDAR_USEPOLLING: 'true',
      CHOKIDAR_INTERVAL: '500',
    },
  })

  beforeAll(async () => {
    await fs.chmod(path.join(next.testDir, pageHello), READ_ONLY_PERMISSIONS)
    await next.start()
  })

  async function patchFileReadOnly(
    filename: string,
    content: (content: string | undefined) => string | undefined,
    runWithTempContent: (context: { newFile: boolean }) => Promise<void>
  ) {
    const filePath = path.join(next.testDir, filename)
    const exists = await fs
      .access(filePath)
      .then(() => true)
      .catch(() => false)

    if (exists) {
      await fs.chmod(filePath, READ_WRITE_PERMISSIONS)
    }

    const previousContent = exists ? await next.readFile(filename) : undefined

    const newContent = content(previousContent)
    if (newContent === undefined) {
      if (exists) {
        await fs.remove(filePath)
      }
    } else {
      await fs.writeFile(filePath, newContent)
    }

    try {
      if (newContent !== undefined) {
        await fs.chmod(filePath, READ_ONLY_PERMISSIONS)
      }
      await runWithTempContent({ newFile: !exists })
    } finally {
      if (newContent !== undefined) {
        await fs.chmod(filePath, READ_WRITE_PERMISSIONS)
      }
      if (previousContent === undefined) {
        await fs.remove(filePath)
      } else {
        await fs.writeFile(filePath, previousContent)
        await fs.chmod(filePath, READ_ONLY_PERMISSIONS)
      }
    }
  }

  it('should detect changes to a page', async () => {
    let browser: Playwright

    try {
      browser = await next.browser('/hello')
      await retry(async () =>
        expect(await getBrowserBodyText(browser)).toContain('Hello World')
      )

      await patchFileReadOnly(
        pageHello,
        (content) => content.replace('Hello World', 'COOL page'),
        async () => {
          await retry(async () =>
            expect(await getBrowserBodyText(browser)).toContain('COOL page')
          )
        }
      )

      await retry(async () =>
        expect(await getBrowserBodyText(browser)).toContain('Hello World')
      )
    } finally {
      await browser?.close()
    }
  })

  it('should handle page deletion and subsequent recreation', async () => {
    let browser: Playwright

    try {
      browser = await next.browser('/hello')
      await retry(async () =>
        expect(await getBrowserBodyText(browser)).toContain('Hello World')
      )

      await patchFileReadOnly(
        pageHello,
        () => undefined,
        async () => {
          await retry(async () =>
            expect(await getBrowserBodyText(browser)).toContain(
              'This page could not be found'
            )
          )
        }
      )

      await retry(async () => {
        if (!process.env.IS_TURBOPACK_TEST) {
          // webpack doesn't automatically refresh the page when a page is added?
          await browser.refresh()
        }
        expect(await getBrowserBodyText(browser)).toContain('Hello World')
      })
    } finally {
      await browser?.close()
    }
  })

  it('should detect a new page', async () => {
    let browser: Playwright

    try {
      await patchFileReadOnly(
        'pages/new.js',
        () => `
        const New = () => <p>New page</p>

        export default New
      `,
        async () => {
          browser = await next.browser('/new')
          await retry(async () =>
            expect(await getBrowserBodyText(browser)).toContain('New page')
          )
        }
      )
    } finally {
      await browser?.close()
    }
  })
})
