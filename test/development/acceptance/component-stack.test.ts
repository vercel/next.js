/* eslint-env jest */
import { nextTestSetup } from 'e2e-utils'
import { getRedboxComponentStack, hasRedbox } from 'next-test-utils'
import path from 'path'

describe('Component Stack in error overlay', () => {
  const { next } = nextTestSetup({
    files: path.join(__dirname, 'fixtures', 'component-stack'),
  })

  it('should show a component stack on hydration error', async () => {
    const browser = await next.browser('/')

    expect(await hasRedbox(browser)).toBe(true)

    if (process.env.TURBOPACK) {
      expect(await getRedboxComponentStack(browser)).toMatchInlineSnapshot(`
          "...
            <App>
              <Mismatch>
                <main>
                  <Component>
                    <div>
                      <p>
                        "server"
                        "client""
        `)
    } else {
      expect(await getRedboxComponentStack(browser)).toMatchInlineSnapshot(`
          "<Mismatch>
            <main>
              <Component>
                <div>
                  <p>
                    "server"
                    "client""
        `)
    }
  })
})
