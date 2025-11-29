/* eslint-env jest */
// @ts-ignore - Module will be available after build
import { initialize } from 'next/dist/server/lib/router-server'
import { useTempDir } from '../lib/use-temp-dir'
import fs from 'fs-extra'
import path from 'path'

describe('router-server process listeners', () => {
  it('should not accumulate listeners when initialize() is called multiple times', async () => {
    await useTempDir(async (dir) => {
      // Create minimal Next.js project structure
      await fs.writeFile(
        path.join(dir, 'package.json'),
        JSON.stringify({ name: 'test', version: '1.0.0' })
      )
      await fs.writeFile(
        path.join(dir, 'next.config.js'),
        'module.exports = {}'
      )
      await fs.mkdirp(path.join(dir, 'pages'))
      await fs.writeFile(
        path.join(dir, 'pages', 'index.js'),
        'export default function Home() { return <div>Hello</div> }'
      )

      // Get initial listener counts
      const getListenerCounts = () => {
        const uncaughtListeners = process.listeners('uncaughtException')
        const unhandledListeners = process.listeners('unhandledRejection')

        const boundLogErrorUncaught = uncaughtListeners.filter(
          (l) => (l as { name?: string }).name === 'bound logError'
        ).length
        const boundLogErrorUnhandled = unhandledListeners.filter(
          (l) => (l as { name?: string }).name === 'bound logError'
        ).length

        return {
          uncaught: uncaughtListeners.length,
          unhandled: unhandledListeners.length,
          boundLogErrorUncaught,
          boundLogErrorUnhandled,
        }
      }

      const initialCounts = getListenerCounts()

      // Call initialize() multiple times with the same dir (simulating serverless environment
      // where the same process handles multiple requests and initialize() may be called repeatedly)
      for (let i = 0; i < 5; i++) {
        await initialize({
          dir,
          port: 3000,
          dev: false,
          onDevServerCleanup: undefined,
          minimalMode: true,
          quiet: true,
        })

        // Check listener counts after each call
        const countsAfterCall = getListenerCounts()

        // Verify that bound logError listeners don't accumulate beyond 1
        // In serverless environments, initialize() may be called multiple times,
        // but we should only have one listener of each type
        expect(countsAfterCall.boundLogErrorUncaught).toBeLessThanOrEqual(
          initialCounts.boundLogErrorUncaught + 1
        )
        expect(countsAfterCall.boundLogErrorUnhandled).toBeLessThanOrEqual(
          initialCounts.boundLogErrorUnhandled + 1
        )
      }

      const finalCounts = getListenerCounts()

      // Final verification: listeners should not have accumulated
      expect(finalCounts.boundLogErrorUncaught).toBeLessThanOrEqual(
        initialCounts.boundLogErrorUncaught + 1
      )
      expect(finalCounts.boundLogErrorUnhandled).toBeLessThanOrEqual(
        initialCounts.boundLogErrorUnhandled + 1
      )

      // Verify no MaxListenersExceededWarning would be triggered
      // (Node.js default max listeners is 10, but we should have far fewer)
      expect(finalCounts.uncaught).toBeLessThan(10)
      expect(finalCounts.unhandled).toBeLessThan(10)
    })
  })
})
