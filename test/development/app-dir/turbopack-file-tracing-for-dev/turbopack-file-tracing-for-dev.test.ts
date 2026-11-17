import { nextTestSetup } from 'e2e-utils'
import globOrig from 'glob'
import { join } from 'path'
import { promisify } from 'util'

const glob = promisify(globOrig)

describe('turbopack-file-tracing-for-dev', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should render pages that read traced files', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('hello from a traced file')
  })

  it('should accept the config option', async () => {
    await next.render('/')
    expect(next.cliOutput).not.toContain('Invalid next.config')
  })

  it('should not write .nft.json files', async () => {
    await next.render('/')
    const nftFiles = await glob('**/*.nft.json', {
      cwd: join(next.testDir, '.next'),
    })
    expect(nftFiles).toEqual([])
  })
})
