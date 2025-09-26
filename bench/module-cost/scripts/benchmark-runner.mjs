import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

/// To use:
/// - Install Playwright: `npx playwright install chromium`
/// - Install dependencies: `pnpm install`
/// - Build the application: `pnpm build-webpack` or pnpm build-turbopack`
/// - Run the benchmark: `pnpm benchmark`

class BenchmarkRunner {
  constructor(options) {
    this.name = options.name
    this.samples = options.samples ?? 50
    this.buttonClickDelay = options.buttonClickDelay ?? 500
    this.results = []
  }

  async runBenchmark() {
    for (let i = 1; i <= this.samples; i++) {
      console.log(`\n--- Running sample ${i}/${this.samples} ---`)

      const result = await this.runSingleSample()
      this.results.push(...result)
    }

    this.saveResults()
    console.log('\nBenchmark completed!')
  }

  async runSingleSample() {
    let server
    let browser

    try {
      // 1. Launch the server
      server = await this.startServer()

      // 2. Launch Chrome incognito
      console.log('Launching browser...')
      browser = await chromium.launch({
        headless: true, // Set to true if you don't want to see the browser
        args: ['--incognito'],
      })

      const context = await browser.newContext()
      const page = await context.newPage()

      // 3. Navigate to localhost:3000
      await page.goto('http://localhost:3000', { waitUntil: 'load' })

      // 4. Find and click all buttons
      const buttons = await page.locator('button').all()

      for (let j = 0; j < buttons.length; j++) {
        await buttons[j].click()
        await this.sleep(this.buttonClickDelay)
      }

      // 5. Capture data from textbox
      console.log('Capturing data from the page...')
      const textboxData = await this.capturePageData(page)
      console.log('Captured data from the page:', textboxData)

      // 6. Close browser
      console.log('Closing browser...')
      await browser.close()
      browser = null

      // 7. Shut down server
      console.log('Shutting down server...')
      await this.stopServer(server)
      server = null

      return textboxData
    } catch (error) {
      // Cleanup in case of error
      if (browser) {
        try {
          await browser.close()
        } catch (e) {
          console.error('Error closing browser:', e.message)
        }
      }
      if (server) {
        try {
          await this.stopServer(server)
        } catch (e) {
          console.error('Error stopping server:', e.message)
        }
      }
      throw error
    }
  }

  async startServer() {
    return new Promise((resolve, reject) => {
      const server = spawn('pnpm', ['start'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true,
      })

      let serverReady = false

      server.stdout.on('data', (data) => {
        const output = data.toString()
        console.log('Server:', output.trim())

        // Look for common Next.js ready indicators
        if (
          output.includes('Ready') ||
          output.includes('started server') ||
          output.includes('Local:')
        ) {
          if (!serverReady) {
            serverReady = true
            resolve(server)
          }
        }
      })

      server.stderr.on('data', (data) => {
        console.error('Server Error:', data.toString().trim())
      })

      server.on('error', (error) => {
        reject(new Error(`Failed to start server: ${error.message}`))
      })

      server.on('close', (code) => {
        if (!serverReady) {
          reject(
            new Error(`Server exited with code ${code} before becoming ready`)
          )
        }
      })

      // Timeout after 30 seconds
      setTimeout(() => {
        if (!serverReady) {
          server.kill()
          reject(new Error('Server startup timeout'))
        }
      }, 30000)
    })
  }

  async stopServer(server) {
    return new Promise((resolve) => {
      if (!server || server.killed) {
        resolve()
        return
      }

      server.on('close', () => {
        resolve()
      })

      // Try graceful shutdown first
      server.kill('SIGTERM')

      // Force kill after 5 seconds
      setTimeout(() => {
        if (!server.killed) {
          server.kill('SIGKILL')
        }
        resolve()
      }, 5000)
    })
  }

  async capturePageData(page) {
    return await page.evaluate(() => globalThis.BENCHMARK_RESULTS)
  }

  async sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  saveResults() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `benchmark-results-${this.name}-${timestamp}.json`

    writeFileSync(
      filename,
      JSON.stringify(summarizeDurations(this.results), null, 2)
    )
    console.log(`Results saved to ${filename}`)
  }
}

const summarizeDurations = (data) => {
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('No data to summarize')
  }

  const byName = new Map()
  for (const item of data) {
    const name = item.name
    if (!byName.has(name)) {
      byName.set(name, [])
    }
    byName.get(name).push(item)
  }
  const results = []
  for (const [name, data] of byName) {
    const loadDurations = data
      .map((item) => item.loadDuration)
      .sort((a, b) => a - b)
    const executeDurations = data
      .map((item) => item.executeDuration)
      .sort((a, b) => a - b)

    const getSummary = (durations) => {
      const sum = durations.reduce((acc, val) => acc + val, 0)
      const average = sum / durations.length

      const middle = Math.floor(durations.length / 2)
      const median =
        durations.length % 2 === 0
          ? (durations[middle - 1] + durations[middle]) / 2
          : durations[middle]

      const percentile75Index = Math.floor(durations.length * 0.75)
      const percentile75 = durations[percentile75Index]

      return {
        average,
        median,
        percentile75,
      }
    }

    results.push({
      name,
      totalSamples: data.length,
      loadDuration: getSummary(loadDurations),
      executeDuration: getSummary(executeDurations),
    })
  }

  return results
}

// CLI usage
const args = process.argv.slice(2)
const samples = args.length > 0 ? Number.parseInt(args[0]) : undefined
const name = args.length > 1 ? args[1] : undefined

const runner = new BenchmarkRunner({
  name,
  samples,
})

runner.runBenchmark().catch(console.error)
