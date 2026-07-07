import { nextTestSetup } from 'e2e-utils'

describe('styled-jsx dynamic styles SSR', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  // Dynamic styled-jsx (with interpolated expressions) produces numeric class
  // names at runtime via the DJB2 hash in styled-jsx's computeId function.
  // This pattern matches production deployments where all jsx class names
  // are numeric (e.g. jsx-2267428885) rather than hex (jsx-f36313d9f07883b7).
  it('should contain dynamic styled-jsx styles during SSR', async () => {
    const html = await next.render('/')

    // Dynamic styled-jsx produces numeric class names at runtime
    const numericClasses = html.match(/\bjsx-\d+\b/g) || []
    console.log('Numeric jsx classes:', [...new Set(numericClasses)])
    expect(numericClasses.length).toBeGreaterThan(0)

    // All dynamic styles should be present as inline <style> tags
    expect(html).toMatch(/color:.*?green/) // main page
    expect(html).toMatch(/color:.*?blue/) // DynamicStyled
    expect(html).toMatch(/background-color:.*?navy/) // header
    expect(html).toMatch(/color:.*?purple/) // footer
  })
})
