import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import fs from 'fs'
import path from 'path'

interface LogEntry {
  timestamp: number
  entry: string
}

function parseEntryLog(logPath: string): LogEntry[] {
  if (!fs.existsSync(logPath)) {
    return []
  }
  const content = fs.readFileSync(logPath, 'utf-8')
  return content
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [timestamp, ...rest] = line.split(':')
      return { timestamp: parseInt(timestamp, 10), entry: rest.join(':') }
    })
}

function parseCallbackLog(logPath: string): number | null {
  if (!fs.existsSync(logPath)) {
    return null
  }
  const content = fs.readFileSync(logPath, 'utf-8')
  const lines = content.split('\n').filter(Boolean)
  if (lines.length === 0) {
    return null
  }
  const [, timestamp] = lines[0].split(':')
  return parseInt(timestamp, 10)
}

describe('deferred-entries webpack', () => {
  const { next, isNextStart, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    skipStart: true,
    dependencies: {},
  })

  if (skipped) return

  beforeAll(async () => {
    // Clear log files before starting
    const entryLogPath = path.join(next.testDir, '.entry-log')
    const callbackLogPath = path.join(next.testDir, '.callback-log')
    try {
      fs.writeFileSync(entryLogPath, '')
      fs.writeFileSync(callbackLogPath, '')
    } catch (e) {
      // Ignore
    }
    await next.start()
  })

  afterAll(async () => {
    await next.stop()
  })

  it('should build deferred entry successfully', async () => {
    // Access the deferred page - use retry to handle on-demand compilation timing
    await retry(async () => {
      const deferredRes = await next.fetch('/deferred')
      expect(deferredRes.status).toBe(200)
      expect(await deferredRes.text()).toContain('Deferred Page')
    })
  })

  it('should build pages router routes when using deferred entries', async () => {
    // Verify pages router page works alongside deferred app router entries
    await retry(async () => {
      const legacyRes = await next.fetch('/legacy')
      expect(legacyRes.status).toBe(200)
      expect(await legacyRes.text()).toContain('Legacy Pages Router Page')
    })
  })

  it('should build pages router API routes when using deferred entries', async () => {
    // Verify pages router API route works alongside deferred app router entries
    await retry(async () => {
      const apiRes = await next.fetch('/api/hello')
      expect(apiRes.status).toBe(200)
      const data = await apiRes.json()
      expect(data.message).toBe('Hello from pages API route')
    })
  })

  it('should call onBeforeDeferredEntries before building deferred entry', async () => {
    // Verify the callback was executed
    const callbackLogPath = path.join(next.testDir, '.callback-log')
    await retry(async () => {
      const callbackTimestamp = parseCallbackLog(callbackLogPath)
      expect(callbackTimestamp).not.toBeNull()
    })
  })

  if (!isNextStart) {
    it('should call onBeforeDeferredEntries during HMR even when non-deferred entry changes', async () => {
      const callbackLogPath = path.join(next.testDir, '.callback-log')

      // First, access the deferred page to trigger the initial callback
      await retry(async () => {
        const deferredRes = await next.fetch('/deferred')
        expect(deferredRes.status).toBe(200)
      })

      // Access the home page so it gets added to tracked entries for HMR
      await retry(async () => {
        const homeRes = await next.fetch('/')
        expect(homeRes.status).toBe(200)
      })

      // Get the initial callback timestamp (should now be set)
      let initialTimestamp: number | null = null
      await retry(async () => {
        initialTimestamp = parseCallbackLog(callbackLogPath)
        expect(initialTimestamp).not.toBeNull()
      })

      // Wait a bit to ensure timestamps will be different
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Modify the home page (non-deferred entry) to trigger HMR
      await next.patchFile('app/page.tsx', (content) =>
        content.replace('Home Page', 'Home Page Updated')
      )

      // Wait for HMR to complete and callback to be called again
      await retry(async () => {
        const newTimestamp = parseCallbackLog(callbackLogPath)
        expect(newTimestamp).not.toBeNull()
        // The callback should have been called again with a newer timestamp
        expect(newTimestamp).toBeGreaterThan(initialTimestamp!)
      })

      // Verify the home page was updated
      await retry(async () => {
        const homeRes = await next.fetch('/')
        expect(homeRes.status).toBe(200)
        expect(await homeRes.text()).toContain('Home Page Updated')
      })
    })
  }

  if (isNextStart) {
    it('should call onBeforeDeferredEntries before processing deferred entries during build', async () => {
      const entryLogPath = path.join(next.testDir, '.entry-log')
      const callbackLogPath = path.join(next.testDir, '.callback-log')

      // Parse the logs
      const entryLog = parseEntryLog(entryLogPath)
      const callbackTimestamp = parseCallbackLog(callbackLogPath)

      // Debug output
      console.log('Entry log:', entryLog)
      console.log('Callback timestamp:', callbackTimestamp)

      // Verify the callback was executed
      expect(callbackTimestamp).not.toBeNull()

      // Find the CALLBACK_EXECUTED marker in the entry log
      // The callback runs in finishMake hook before the build phase starts
      const callbackIndex = entryLog.findIndex(
        (e) => e.entry === 'CALLBACK_EXECUTED'
      )
      expect(callbackIndex).toBeGreaterThan(-1)

      // The loader runs during the build phase (after finishMake completes)
      // So CALLBACK_EXECUTED should appear before loader entries
      // Find loader entries (entries that are file paths, not CALLBACK_EXECUTED)
      const loaderEntries = entryLog.filter(
        (e) => e.entry !== 'CALLBACK_EXECUTED'
      )

      // Verify we have loader entries for both home page and deferred page
      const homePageEntries = loaderEntries.filter(
        (e) => e.entry.includes('page.tsx') && !e.entry.includes('deferred')
      )
      const deferredPageEntries = loaderEntries.filter((e) =>
        e.entry.includes('deferred')
      )

      console.log('Home page entries:', homePageEntries)
      console.log('Deferred page entries:', deferredPageEntries)

      expect(homePageEntries.length).toBeGreaterThan(0)
      expect(deferredPageEntries.length).toBeGreaterThan(0)

      // Verify the callback is called AFTER non-deferred entries
      // (non-deferred entries are built first)
      const latestNonDeferredTimestamp = Math.max(
        ...homePageEntries.map((e) => e.timestamp)
      )
      expect(callbackTimestamp).toBeGreaterThanOrEqual(
        latestNonDeferredTimestamp
      )

      // Verify the callback is called BEFORE deferred entries
      // (deferred entries wait for the callback)
      const earliestDeferredTimestamp = Math.min(
        ...deferredPageEntries.map((e) => e.timestamp)
      )
      expect(callbackTimestamp).toBeLessThanOrEqual(earliestDeferredTimestamp)

      // Verify the home page works
      const homeRes = await next.fetch('/')
      expect(homeRes.status).toBe(200)
      expect(await homeRes.text()).toContain('Home Page')

      // Verify the deferred page works
      const deferredRes = await next.fetch('/deferred')
      expect(deferredRes.status).toBe(200)
      expect(await deferredRes.text()).toContain('Deferred Page')
    })
  }
})
