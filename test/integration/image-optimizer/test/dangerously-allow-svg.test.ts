import { join } from 'path'
import { setupTests } from './util'

const appDir = join(__dirname, '../app')
const imagesDir = join(appDir, '.next', 'cache', 'images')

describe('with dangerouslyAllowSVG config', () => {
  setupTests({
    nextConfigImages: { dangerouslyAllowSVG: true },
    appDir,
    imagesDir,
  })
})
