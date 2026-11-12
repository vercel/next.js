import { nextTestSetup } from 'e2e-utils'
import { getDistDir } from 'next-test-utils'

describe('dist-dir-files', () => {
  const { next, isNextDeploy, isTurbopack } = nextTestSetup({
    files: __dirname,
    // The files in the distDir are CommonJS, which needs a `package.json` in
    // the distDir when the project's one has `"type": "module"`.
    packageJson: { type: 'module' },
  })

  it('should render the page', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('hello world')
  })

  // The distDir is not accessible when deployed.
  if (!isNextDeploy) {
    it('should mark the distDir as CommonJS', async () => {
      const packageJson = JSON.parse(
        await next.readFile(`${getDistDir()}/package.json`)
      )
      expect(packageJson).toEqual({ type: 'commonjs' })
    })

    it('should mark the distDir as built with Turbopack', async () => {
      expect(await next.hasFile(`${getDistDir()}/turbopack`)).toBe(isTurbopack)
    })
  }
})
