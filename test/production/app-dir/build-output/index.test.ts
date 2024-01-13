import { createNextDescribe } from 'e2e-utils'
import stripAnsi from 'strip-ansi'

createNextDescribe(
  'production - app dir - build output',
  {
    files: {
      'app/page.tsx': `export default function Page() { return null }`,
      'app/layout.tsx': `export default function Layout({ children }) {
        return (
          <html><body>{children}</body></html>
        )
      }`,
    },
  },
  ({ next }) => {
    let output = ''
    beforeAll(() => {
      output = stripAnsi(next.cliOutput)
    })

    it('should only log app routes', async () => {
      expect(output).toContain('Route (app)')
      expect(output).not.toContain('Route (pages)')
      expect(output).not.toContain('/favicon.ico')
    })

    it('should always log version first then the rest jobs', async () => {
      const indexOfVersion = output.indexOf('▲ Next.js')
      const indexOfStartCompiling = output.indexOf(
        'Creating an optimized production build'
      )
      const indexOfLinting = output.indexOf(
        'Linting and checking validity of types'
      )
      expect(indexOfVersion).toBeLessThan(indexOfLinting)
      expect(indexOfStartCompiling).toBeLessThan(indexOfLinting)
    })

    it('should match the expected output format', async () => {
      expect(output).toContain('Size')
      expect(output).toContain('First Load JS')
      expect(output).toContain('+ First Load JS shared by all')
      expect(output).toContain('└ other shared chunks (total)')

      // output type
      expect(output).toContain('○  (Static)  prerendered as static content')
    })
  }
)
