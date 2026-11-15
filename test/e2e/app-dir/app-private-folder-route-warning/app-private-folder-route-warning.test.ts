import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

const WARNING_HEADER =
  'Folders prefixed with "_" are private and excluded from routing'

function countOccurrences(haystack: string, needle: string) {
  return haystack.split(needle).length - 1
}

describe('app-private-folder-route-warning', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  it('should not route page and route files inside private folders', async () => {
    expect((await next.fetch('/_playground/foo')).status).toBe(404)
    expect((await next.fetch('/_private')).status).toBe(404)
  })

  it('should route folders escaped with %5F', async () => {
    const res = await next.fetch('/_escaped')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('escaped route')
  })

  it('should warn about page and route files inside private folders', async () => {
    await retry(async () => {
      expect(next.cliOutput).toContain(WARNING_HEADER)
    })

    const output = next.cliOutput
    expect(output).toContain('app/_playground/[action]/route.ts')
    expect(output).toContain('app/_private/page.tsx')
    expect(output).toContain('%5F')
    expect(output).not.toContain('app/_components/button.tsx')
    expect(output).not.toContain('app/%5Fescaped/route.ts')
    expect(countOccurrences(output, 'app/_playground/[action]/route.ts')).toBe(
      1
    )
  })

  if (isNextDev) {
    it('should not repeat the warning when other files change', async () => {
      await next.patchFile(
        'app/page.tsx',
        (content) => content.replace('hello world', 'hello again'),
        async () => {
          await retry(async () => {
            expect(await next.render('/')).toContain('hello again')
          })
        }
      )
      expect(
        countOccurrences(next.cliOutput, 'app/_playground/[action]/route.ts')
      ).toBe(1)
    })
    it('should warn about page files added to private folders', async () => {
      await next.patchFile(
        'app/_added/page.tsx',
        'export default function Page() { return <p>added</p> }',
        async () => {
          await retry(async () => {
            expect(next.cliOutput).toContain('app/_added/page.tsx')
          })
        }
      )
    })
  }
})
