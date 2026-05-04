import { nextTestSetup } from 'e2e-utils'

describe('metadata-static-file-gsp', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
  })

  if (skipped) {
    return
  }

  it('should build and serve a static metadata file colocated with generateStaticParams', async () => {
    await next.render('/results/two')
  })
})
