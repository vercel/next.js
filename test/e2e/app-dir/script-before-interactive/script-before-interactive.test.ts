import { nextTestSetup } from 'e2e-utils'

describe('Script component with beforeInteractive strategy CSS class rendering', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should render script tag with correct class attribute instead of classname', async () => {
    const browser = await next.browser('/')

    // Wait for the page to fully load
    await browser.waitForElementByCss('script#example-script')

    // Get the HTML content to check the actual rendered attributes
    const html = await browser.eval(() => document.documentElement.innerHTML)

    // Check that the script tag has 'class' attribute, not 'classname'
    expect(html).toContain('class="example-class"')
    expect(html).not.toContain('classname="example-class"')

    // Also verify the script element directly
    const scriptElement = await browser.elementByCss('script#example-script')
    const className = await scriptElement.getAttribute('class')

    expect(className).toBe('example-class')
  })

  it('should execute beforeInteractive script correctly', async () => {
    const browser = await next.browser('/')

    // Check that the script executed by looking for its side effects
    const hasExecuted = await browser.eval(() => {
      return (window as any).beforeInteractiveExecuted === true
    })

    expect(hasExecuted).toBe(true)
  })

  it('should render script in document head with beforeInteractive strategy', async () => {
    const browser = await next.browser('/')

    // Check that the script is in the head section
    const scriptInHead = await browser.eval(() => {
      return document.head.querySelector('#example-script') !== null
    })

    expect(scriptInHead).toBe(true)
  })

  it('should render multiple beforeInteractive scripts with correct class attributes', async () => {
    const browser = await next.browser('/multiple')

    const html = await browser.eval(() => document.documentElement.innerHTML)

    // Check that both scripts have correct class attributes
    expect(html).toContain('class="first-script"')
    expect(html).toContain('class="second-script"')
    expect(html).not.toContain('classname="first-script"')
    expect(html).not.toContain('classname="second-script"')
  })
})
