/* eslint-env jest */
import webdriver from 'next-webdriver'
import { readFileSync } from 'fs'
import { join, resolve as resolvePath } from 'path'
import { renderViaHTTP, getBrowserBodyText, waitFor } from 'next-test-utils'
import { recursiveReadDir } from 'next/dist/lib/recursive-readdir'
import { homedir } from 'os'

// Does the same evaluation checking for INJECTED for 15 seconds, triggering every 500ms
async function checkInjected (browser) {
  const start = Date.now()
  while (Date.now() - start < 15000) {
    const bodyText = await getBrowserBodyText(browser)
    if (/INJECTED/.test(bodyText)) {
      throw new Error('Vulnerable to XSS attacks')
    }
    await waitFor(500)
  }
}

module.exports = (context) => {
  describe('With Security Related Issues', () => {
    it('should only access files inside .next directory', async () => {
      const buildId = readFileSync(join(__dirname, '../.next/BUILD_ID'), 'utf8')

      const pathsToCheck = [
        `/_next/${buildId}/page/../../../info`,
        `/_next/${buildId}/page/../../../info.js`,
        `/_next/${buildId}/page/../../../info.json`,
        `/_next/:buildId/webpack/chunks/../../../info.json`,
        `/_next/:buildId/webpack/../../../info.json`,
        `/_next/../../../info.json`,
        `/static/../../../info.json`
      ]

      for (const path of pathsToCheck) {
        const data = await renderViaHTTP(context.appPort, path)
        expect(data.includes('cool-version')).toBeFalsy()
      }
    })

    it("should not leak the user's home directory into the build", async () => {
      const buildId = readFileSync(join(__dirname, '../.next/BUILD_ID'), 'utf8')

      const readPath = join(__dirname, `../.next/static/${buildId}`)
      const buildFiles = await recursiveReadDir(readPath, /\.js$/)

      if (buildFiles.length < 1) {
        throw new Error('Could not locate any build files')
      }

      const homeDir = homedir()
      buildFiles.forEach(buildFile => {
        const content = readFileSync(join(readPath, buildFile), 'utf8')
        if (content.includes(homeDir)) {
          throw new Error(
            `Found the user's home directory in: ${buildFile}, ${homeDir}\n\n${content}`
          )
        }

        const checkPathProject = resolvePath(__dirname, ...Array(5).fill('..'))
        if (
          content.includes(checkPathProject) ||
          (process.platform.match(/win/) &&
            content.includes(checkPathProject.replace(/\\/g, '\\\\')))
        ) {
          throw new Error(
            `Found the project path in: ${buildFile}, ${checkPathProject}\n\n${content}`
          )
        }
      })
    })

    it('should prevent URI based XSS attacks', async () => {
      const browser = await webdriver(context.appPort, '/\',document.body.innerHTML="INJECTED",\'')
      await checkInjected(browser)
      await browser.close()
    })

    it('should prevent URI based XSS attacks using single quotes', async () => {
      const browser = await webdriver(context.appPort, `/'-(document.body.innerHTML='INJECTED')-'`)
      await checkInjected(browser)
      await browser.close()
    })

    it('should prevent URI based XSS attacks using double quotes', async () => {
      const browser = await webdriver(context.appPort, `/"-(document.body.innerHTML='INJECTED')-"`)
      await checkInjected(browser)

      await browser.close()
    })

    it('should prevent URI based XSS attacks using semicolons and double quotes', async () => {
      const browser = await webdriver(context.appPort, `/;"-(document.body.innerHTML='INJECTED')-"`)
      await checkInjected(browser)

      await browser.close()
    })

    it('should prevent URI based XSS attacks using semicolons and single quotes', async () => {
      const browser = await webdriver(context.appPort, `/;'-(document.body.innerHTML='INJECTED')-'`)
      await checkInjected(browser)

      await browser.close()
    })

    it('should prevent URI based XSS attacks using src', async () => {
      const browser = await webdriver(context.appPort, `/javascript:(document.body.innerHTML='INJECTED')`)
      await checkInjected(browser)

      await browser.close()
    })

    it('should prevent URI based XSS attacks using querystring', async () => {
      const browser = await webdriver(context.appPort, `/?javascript=(document.body.innerHTML='INJECTED')`)
      await checkInjected(browser)

      await browser.close()
    })

    it('should prevent URI based XSS attacks using querystring and quotes', async () => {
      const browser = await webdriver(context.appPort, `/?javascript="(document.body.innerHTML='INJECTED')"`)
      await checkInjected(browser)
      await browser.close()
    })
  })
}
