import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'

const publicationPauseFile = path.join(
  os.tmpdir(),
  `next-route-publication-${process.pid}`
)
const publicationFailFile = path.join(
  os.tmpdir(),
  `next-route-publication-fail-${process.pid}`
)
describe('atomic-dev-route-publication', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: {
      NEXT_TEST_DEV_ROUTE_PUBLICATION_PAUSE_FILE: publicationPauseFile,
      NEXT_TEST_DEV_ROUTE_PUBLICATION_PATH: '/conflict.txt',
      NEXT_TEST_DEV_ROUTE_PUBLICATION_FAIL_FILE: publicationFailFile,
    },
  })

  it('publishes one complete route generation at a time', async () => {
    await retry(async () => {
      expect(next.cliOutput).toContain(
        '[next-test] initial dev route publication completed'
      )
    }, 15_000)
    const initialResponse = await next.fetch('/conflict.txt')
    expect(initialResponse.status).toBe(200)
    expect(await initialResponse.text()).toBe('public file\n')

    const pauseFile = publicationPauseFile
    const claimedPauseFile = `${pauseFile}.claimed`
    const outputStart = next.cliOutput.length
    await fs.mkdir(path.dirname(pauseFile), { recursive: true })
    await fs.writeFile(pauseFile, '')
    try {
      await next.patchFile(
        'app/conflict.txt/page.tsx',
        `export default function Page() { return 'page' }`
      )
      await retry(async () => {
        expect(next.cliOutput.slice(outputStart)).toContain(
          '[next-test] dev route publication paused'
        )
      }, 15_000)

      const response = await next.fetch('/conflict.txt')
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('public file\n')
    } finally {
      await Promise.all([
        fs.rm(pauseFile, { force: true }),
        fs.rm(claimedPauseFile, { force: true }),
      ])
      await retry(async () => {
        expect(next.cliOutput.slice(outputStart)).toContain(
          '[next-test] dev route publication completed: route=true'
        )
      }, 15_000)
      const removalOutputStart = next.cliOutput.length
      await next.deleteFile('app/conflict.txt/page.tsx')
      await retry(async () => {
        expect(next.cliOutput.slice(removalOutputStart)).toContain(
          '[next-test] dev route publication completed: route=false'
        )
      }, 15_000)
    }
  })

  it('keeps the previous generation when candidate publication fails', async () => {
    const claimedFailFile = `${publicationFailFile}.claimed`
    const outputStart = next.cliOutput.length
    await fs.writeFile(publicationFailFile, '')
    try {
      await next.patchFile(
        'app/rejected/route.ts',
        `export function GET() { return new Response('rejected') }`
      )
      await retry(async () => {
        expect(next.cliOutput.slice(outputStart)).toContain(
          '[next-test] dev route publication failed'
        )
      }, 15_000)

      expect((await next.fetch('/rejected')).status).toBe(404)

      await next.patchFile(
        'app/rejected/route.ts',
        `export function GET() { return new Response('recovered') }`
      )
      await retry(async () => {
        const response = await next.fetch('/rejected')
        expect(response.status).toBe(200)
        expect(await response.text()).toBe('recovered')
      }, 15_000)
    } finally {
      await Promise.all([
        fs.rm(publicationFailFile, { force: true }),
        fs.rm(claimedFailFile, { force: true }),
        next.deleteFile('app/rejected/route.ts'),
      ])
    }
  })
})
