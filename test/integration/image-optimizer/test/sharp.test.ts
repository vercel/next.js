import { join } from 'path'
import { setupTests } from './util'

const appDir = join(__dirname, '../app')

describe('with latest sharp', () => {
  setupTests({ appDir })
})
