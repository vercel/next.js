import { runTests } from './utils'

describe('yarn PnP', () => {
  runTests('with-next-sass', '/', [
    'Hello World, I am being styled using SCSS Modules',
  ])
})
