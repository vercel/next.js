import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('Invalid revalidate values', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not show error initially', async () => {
    const html = await next.render('/ssg')
    expect(html).toContain('a-ok')
  })

  it('should not show error for false revalidate value', async () => {
    const originalContent = await next.readFile('pages/ssg.js')
    await next.patchFile(
      'pages/ssg.js',
      originalContent.replace('revalidate: 1', 'revalidate: false')
    )

    await retry(async () => {
      const html = await next.render('/ssg')
      expect(html).toContain('a-ok')
    })

    await next.patchFile('pages/ssg.js', originalContent)
  })

  it('should not show error for true revalidate value', async () => {
    const originalContent = await next.readFile('pages/ssg.js')
    await next.patchFile(
      'pages/ssg.js',
      originalContent.replace('revalidate: 1', 'revalidate: true')
    )

    await retry(async () => {
      const html = await next.render('/ssg')
      expect(html).toContain('a-ok')
    })

    await next.patchFile('pages/ssg.js', originalContent)
  })

  it('should show error for string revalidate value', async () => {
    const originalContent = await next.readFile('pages/ssg.js')
    await next.patchFile(
      'pages/ssg.js',
      originalContent.replace('revalidate: 1', 'revalidate: "1"')
    )

    await retry(async () => {
      const html = await next.render('/ssg')
      expect(html).toMatch(
        /A page's revalidate option must be seconds expressed as a natural number. Mixed numbers and strings cannot be used. Received/
      )
    })

    await next.patchFile('pages/ssg.js', originalContent)
  })

  it('should show error for null revalidate value', async () => {
    const originalContent = await next.readFile('pages/ssg.js')
    await next.patchFile(
      'pages/ssg.js',
      originalContent.replace('revalidate: 1', 'revalidate: null')
    )

    await retry(async () => {
      const html = await next.render('/ssg')
      expect(html).toMatch(
        /A page's revalidate option must be seconds expressed as a natural number. Mixed numbers and strings cannot be used. Received/
      )
    })

    await next.patchFile('pages/ssg.js', originalContent)
  })

  it('should show error for float revalidate value', async () => {
    const originalContent = await next.readFile('pages/ssg.js')
    await next.patchFile(
      'pages/ssg.js',
      originalContent.replace('revalidate: 1', 'revalidate: 1.1')
    )

    await retry(async () => {
      const html = await next.render('/ssg')
      expect(html).toMatch(
        /A page's revalidate option must be seconds expressed as a natural number for \/ssg. Mixed numbers, such as/
      )
    })

    await next.patchFile('pages/ssg.js', originalContent)
  })
})
