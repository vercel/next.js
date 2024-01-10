import { createNextDescribe } from 'e2e-utils'
import stripAnsi from 'strip-ansi'

createNextDescribe(
  'production - app dir - build output',
  {
    files: {
      'app/page.js': `export default function Page() { return null }`,
      'app/layout.js': `export default function Layout({ children }) {
        return (
          <html><body>{children}</body></html>
        )
      }`,
    },
  },
  ({ next }) => {
    it('should only log app routes', async () => {
      const output = next.cliOutput
      expect(output).toContain('Route (app)')
      expect(output).not.toContain('Route (pages)')
      expect(output).not.toContain('/favicon.ico')
    })

    it('should match the expected output format', async () => {
      const output = stripAnsi(next.cliOutput)
      expect(output).toContain('Size')
      expect(output).toContain('First Load JS')
      expect(output).toContain('+ First Load JS shared by all')
      expect(output).toContain('└ other shared chunks (total)')

      // output type
      expect(output).toContain('○  (Static)  prerendered as static content')
    })
  }
)
