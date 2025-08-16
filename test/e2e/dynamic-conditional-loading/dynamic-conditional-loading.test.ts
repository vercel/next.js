import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('dynamic conditional loading', () => {
  const { next, isNextStart, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should only include the rendered module script tag', async () => {
    const $ = await next.render$('/conditional?component=first')
    const html = $('html').html()
    expect(html).toContain('First Dynamic Component')
    expect(html).not.toContain('Second Dynamic Component')
  })

  it('should only load the rendered module in the browser', async () => {
    const browser = await next.browser('/conditional?component=first')
    await browser.waitForElementByCss('#dynamic-content')
    
    const html = await browser.eval('document.documentElement.innerHTML')
    expect(html).toContain('First Dynamic Component')
    expect(html).not.toContain('Second Dynamic Component')
    
    await browser.close()
  })

  it('should handle client-side navigation between conditional components', async () => {
    const browser = await next.browser('/conditional?component=first')
    await browser.waitForElementByCss('#dynamic-content')
    
    expect(await browser.elementByCss('#dynamic-content').text()).toContain(
      'First Dynamic Component'
    )
    
    await browser.elementByCss('#nav-second').click()
    
    await retry(async () => {
      const text = await browser.elementByCss('#dynamic-content').text()
      expect(text).toContain('Second Dynamic Component')
    })
    
    const finalContent = await browser.elementByCss('#dynamic-content').text()
    expect(finalContent).not.toContain('First Dynamic Component')
    
    await browser.close()
  })

  if (isNextStart) {
    it('should not load unnecessary chunks for conditional imports', async () => {
      const browser = await next.browser('/conditional?component=first')
      await browser.waitForElementByCss('#dynamic-content')
      
      const networkRequests = await browser.eval(() => {
        return Array.from(performance.getEntriesByType('resource'))
          .filter(entry => entry.name.includes('.js') && entry.name.includes('chunk'))
          .map(entry => entry.name)
      })
      
      const secondComponentChunks = networkRequests.filter(req => 
        req.includes('second-component')
      )
      
      expect(secondComponentChunks.length).toBe(0)
      
      await browser.close()
    })
  }
})