import { join } from 'path'
import { setupTests } from './util'

const appDir = join(__dirname, '../app')

describe('with isrFlushToDisk false config', () => {
  setupTests({
    appDir,
    nextConfigExperimental: { isrFlushToDisk: false },
  })
})
