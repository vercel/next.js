import glob from 'glob'
import { nextTestSetup } from 'e2e-utils'
import path from 'path'

describe('terser-class-static-blocks', () => {
  const { next, isNextDeploy } = nextTestSetup({
    files: __dirname,
    nextConfig: {},
  })

  it('should work using cheerio', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('hello world')
  })

  if (!isNextDeploy) {
    it('should have stripped away all comments', async () => {
      const chunksDir = path.join(next.testDir, '.next/static')
      const chunks = glob.sync('**/*.js', {
        cwd: chunksDir,
      })

      expect(chunks.length).toBeGreaterThan(0)

      for (const chunk of chunks) {
        expect(
          await next.readFile(path.join('.next/static', chunk), 'utf8')
        ).not.toContain('/*')
      }
    })
  }
})
