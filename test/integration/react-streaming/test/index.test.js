/* eslint-env jest */

import { join } from 'path'
import { File, runDevSuite, runProdSuite } from 'next-test-utils'
import streaming from './streaming'

const page500 = `
export default function Page500() {
  return 'custom-500-page'
}
`

const appDir = join(__dirname, '../app')
const error500Page = new File(join(appDir, 'pages/500.js'))

const testSuite = {
  runTests: (context, env) => {
    const options = { env }
    streaming(context, options)
  },
  beforeAll: () => {
    error500Page.write(page500)
  },
  afterAll: () => {
    error500Page.delete()
  },
}

runDevSuite('streaming dev', appDir, testSuite)
runProdSuite('streaming prod', appDir, testSuite)
