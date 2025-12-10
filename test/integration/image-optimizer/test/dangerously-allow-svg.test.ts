import { join } from 'path'
import { setupTests } from './util'

const appDir = join(__dirname, '../app')

describe('with dangerouslyAllowSVG config', () => {
  setupTests({
    nextConfigImages: { dangerouslyAllowSVG: true },
    appDir,
  })
})
