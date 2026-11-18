import fs from 'fs/promises'
import path from 'path'
import { nextTestSetup } from 'e2e-utils'

// Creates a dangling symlink in the project directory before building.
describe('dangling-symlink-project-dir', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  beforeAll(async () => {
    // e.g. a gitignored link to a local-only directory that doesn't exist
    await fs.symlink('does-not-exist', path.join(next.testDir, 'dangling-link'))
    await next.start()
  })

  it('builds and serves the app', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('hello world')
  })
})
