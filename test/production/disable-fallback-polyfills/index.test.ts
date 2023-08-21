import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'

describe('Disable fallback polyfills', () => {
  let next: NextInstance

  function getFirstLoadSize(output: string) {
    const firstLoadRe =
      /○ \/.*? (?<size>\d.*?) [^\d]{2} (?<firstLoad>\d.*?) [^\d]{2}/
    return Number(output.match(firstLoadRe).groups.firstLoad)
  }

  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/index.js': `
          import { useEffect } from 'react'
          import crypto from 'crypto'

          export default function Page() {
            useEffect(() => {
              crypto;
            }, [])
            return <p>hello world</p>
          } 
        `,
      },
      dependencies: {
        axios: '0.27.2',
      },
    })
    await next.stop()
  })
  afterAll(() => next.destroy())

  it('Fallback polyfills added by default', async () => {
    expect(getFirstLoadSize(next.cliOutput)).not.toBeLessThan(200)
  })

  it('Reduced bundle size when polyfills are disabled', async () => {
    await next.patchFile(
      'next.config.js',
      `module.exports = {
        experimental: {
          fallbackNodePolyfills: false
        }
      }`
    )
    await next.start()
    await next.stop()

    expect(getFirstLoadSize(next.cliOutput)).toBeLessThan(200)
  })

  it('Pass build without error if non-polyfilled module is unreachable', async () => {
    // `axios` uses `Buffer`, but it should be unreachable in the browser.
    // https://github.com/axios/axios/blob/649d739288c8e2c55829ac60e2345a0f3439c730/lib/helpers/toFormData.js#L138
    await next.patchFile(
      'pages/index.js',
      `import axios from 'axios'
       import { useEffect } from 'react'

       export default function Home() {
         useEffect(() => {
           axios.get('/api')
         }, [])

         return "hello world"
       }`
    )

    await expect(next.start()).not.toReject()
  })
})
