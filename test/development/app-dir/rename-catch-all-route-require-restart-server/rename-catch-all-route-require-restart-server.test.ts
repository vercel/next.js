import { nextTestSetup } from 'e2e-utils'

describe('rename-catch-all-route-require-restart-server', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should render props param value after rename catch-all route folder', async () => {
    // show text of param
    const $ = await next.render$('/foo')
    expect($('p').text()).toBe('foo')

    // rename the folder
    await next.renameFolder('app/[[...slug]]', 'app/[[...newSlug]]')

    // should not show since passed props is still `slug`, not `newSlug`
    const $1 = await next.render$('/foo')
    expect($1('p').text()).toBe('')

    // replace `slug` with `newSlug` of the page content
    await next.patchFile('app/[[...newSlug]]/page.tsx', (content) =>
      content.replaceAll('slug', 'newSlug')
    )

    // should show text of param again
    const $2 = await next.render$('/foo')
    expect($2('p').text()).toBe('foo')
  })
})
