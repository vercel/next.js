import { createNextDescribe } from 'e2e-utils'

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
  }
)
