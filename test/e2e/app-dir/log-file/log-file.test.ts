import fs from 'fs'
import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('log-file', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  function hasLogFile(): boolean {
    const logPath = path.join(
      next.testDir,
      '.next',
      'logs',
      'next-development.log'
    )

    return fs.existsSync(logPath)
  }

  function readLogFile(): string {
    const logPath = path.join(
      next.testDir,
      '.next',
      'logs',
      'next-development.log'
    )
    if (fs.existsSync(logPath)) {
      return fs.readFileSync(logPath, 'utf8')
    }
    return ''
  }

  let previousLogContent = ''

  function normalizeLogContent(content: string): string {
    return (
      content
        // Normalize "Ready in XXXms" patterns
        .replace(/Ready in \d+ms/g, 'Ready in xxxms')
        // Normalize "Compiled ... in XXXms (XXX modules)" patterns
        .replace(
          /Compiled ([^\s]+(?:\s[^\s]+)*) in \d+ms \(\d+ modules\)/g,
          'Compiled $1 in xxxms (xxx modules)'
        )
        // Normalize timestamps to consistent format
        .replace(/\[\d{2}:\d{2}:\d{2}\.\d{3}\]/g, '[xx:xx:xx.xxx]')
    )
  }

  function getNewLogContent(): string {
    const currentContent = readLogFile()
    const newContent = currentContent.slice(previousLogContent.length)
    previousLogContent = currentContent
    return normalizeLogContent(newContent)
  }

  it('should capture RSC logging in log file', async () => {
    // Make request to RSC page
    await next.fetch('/server')
    // Wait for logs to be written (increased timeout for batched logging)
    await new Promise((resolve) => setTimeout(resolve, 1500))

    await retry(async () => {
      if (isNextDev) {
        const newLogContent = getNewLogContent()
        expect(newLogContent).toMatchInlineSnapshot(`
         "[xx:xx:xx.xxx] [Server] LOG      ✓ Ready in xxxms
         [xx:xx:xx.xxx] [Server] LOG      ○ Compiling /server ...
         [xx:xx:xx.xxx] [Server] LOG      ✓ Compiled /server in xxxms (xxx modules)
         [xx:xx:xx.xxx] [Server] LOG     RSC: This is a log message from server component
         [xx:xx:xx.xxx] [Server] ERROR   RSC: This is an error message from server component
         [xx:xx:xx.xxx] [Server] WARN    RSC: This is a warning message from server component
         "
        `)
      } else {
        expect(hasLogFile()).toBe(false)
      }
    })
  })

  it('should capture client logging in log file', async () => {
    // Make request to client page and wait for hydration
    await next.browser('/client')
    // Wait for logs to be written (increased timeout for batched logging)
    await new Promise((resolve) => setTimeout(resolve, 1500))

    await retry(async () => {
      if (isNextDev) {
        const newLogContent = getNewLogContent()

        expect(newLogContent).toMatchInlineSnapshot(`
         "[xx:xx:xx.xxx] [Server] LOG      ✓ Compiled /client in xxxms (xxx modules)
         [xx:xx:xx.xxx] [Browser] INFO    %cDownload the React DevTools for a better development experience: https://react.dev/link/react-devtools font-weight:bold
         "
        `)
      } else {
        expect(hasLogFile()).toBe(false)
      }
    })
  })

  describe('Pages Router', () => {
    it('should capture client-side logging in pages router', async () => {
      // Make request to pages router page and wait for hydration
      await next.browser('/')
      // Wait for logs to be written (increased timeout for batched logging)
      await new Promise((resolve) => setTimeout(resolve, 1500))

      await retry(async () => {
        if (isNextDev) {
          const newLogContent = getNewLogContent()
          expect(newLogContent).toMatchInlineSnapshot(`
           "[xx:xx:xx.xxx] [Server] LOG      ○ Compiling / ...
           [xx:xx:xx.xxx] [Server] LOG      ✓ Compiled / in xxxms (xxx modules)
           "
          `)
        } else {
          expect(hasLogFile()).toBe(false)
        }
      })
    })

    it('should capture get_server_side_props logging in pages router', async () => {
      // Make request to page with getServerSideProps
      await next.fetch('/get_server_side_props')
      // Wait for logs to be written (increased timeout for batched logging)
      await new Promise((resolve) => setTimeout(resolve, 1500))

      await retry(async () => {
        if (isNextDev) {
          const newLogContent = getNewLogContent()
          expect(newLogContent).toMatchInlineSnapshot(`
           "[xx:xx:xx.xxx] [Server] LOG      ✓ Compiled /get_server_side_props in xxxms (xxx modules)
           [xx:xx:xx.xxx] [Server] LOG     Pages Router SSR: This is a log message from getServerSideProps
           [xx:xx:xx.xxx] [Server] ERROR   Pages Router SSR: This is an error message from getServerSideProps
           [xx:xx:xx.xxx] [Server] WARN    Pages Router SSR: This is a warning message from getServerSideProps
           [xx:xx:xx.xxx] [Browser] LOG     Pages Router: This is a log message from client component
           [xx:xx:xx.xxx] [Browser] ERROR   Pages Router: This is an error message from client component
           [xx:xx:xx.xxx] [Browser] WARN    Pages Router: This is a warning message from client component
           [xx:xx:xx.xxx] [Browser] LOG     Next.js hydrate callback fired
           "
          `)
        } else {
          expect(hasLogFile()).toBe(false)
        }
      })
    })

    it('should capture both client and server logging in pages router', async () => {
      // Make requests to both client and server pages
      await next.browser('/')
      await next.fetch('/get_server_side_props')
      // Wait for logs to be written (increased timeout for batched logging)
      await new Promise((resolve) => setTimeout(resolve, 1500))

      await retry(async () => {
        if (isNextDev) {
          const newLogContent = getNewLogContent()
          expect(newLogContent).toMatchInlineSnapshot(`
           "[xx:xx:xx.xxx] [Server] LOG     Pages Router SSR: This is a log message from getServerSideProps
           [xx:xx:xx.xxx] [Server] ERROR   Pages Router SSR: This is an error message from getServerSideProps
           [xx:xx:xx.xxx] [Server] WARN    Pages Router SSR: This is a warning message from getServerSideProps
           "
          `)
        } else {
          expect(hasLogFile()).toBe(false)
        }
      })
    })
  })
})
