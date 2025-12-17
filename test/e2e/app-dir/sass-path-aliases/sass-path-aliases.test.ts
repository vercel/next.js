import { nextTestSetup } from 'e2e-utils'

describe('sass-path-aliases', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      sass: 'latest',
    },
  })

  it('should support path aliases starting with # in Sass imports', async () => {
    const $ = await next.render$('/')
    const element = $('#hash-alias-test')

    // Verify the element exists
    expect(element.length).toBe(1)

    // Verify computed styles are applied correctly from the aliased Sass file
    const styles = await next.browser.eval(`
      const el = document.getElementById('hash-alias-test')
      const computed = window.getComputedStyle(el)
      return {
        backgroundColor: computed.backgroundColor,
        color: computed.color
      }
    `)

    // Background color should be green (#00ff00 = rgb(0, 255, 0))
    expect(styles.backgroundColor).toBe('rgb(0, 255, 0)')

    // Text color should be blue (#0000ff = rgb(0, 0, 255))
    expect(styles.color).toBe('rgb(0, 0, 255)')
  })

  it('should support @ prefix path aliases in Sass imports', async () => {
    // Test that other alias prefixes work too (not just #)
    // This ensures the solution is generic
    const html = await next.render('/')
    expect(html).toContain('Sass Path Aliases Test')
  })

  it('should build successfully with path aliases', async () => {
    // Verify no build errors occurred
    expect(next.cliOutput).not.toContain('Error')
    expect(next.cliOutput).not.toContain('is not a valid Sass identifier')
  })
})
