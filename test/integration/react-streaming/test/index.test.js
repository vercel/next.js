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
const nextConfig = new File(join(appDir, 'next.config.js'))

const edgeRuntimeBasicSuite = {
  runTests: (context, env) => {
    const options = { runtime: 'experimental-edge', env }
    streaming(context, options)
  },
  beforeAll: () => {
    error500Page.write(page500)
  },
  afterAll: () => {
    error500Page.delete()
  },
}

const nodejsRuntimeBasicSuite = {
  runTests: (context, env) => {
    const options = { runtime: 'nodejs', env }
    streaming(context, options)
  },
  beforeAll: () => {
    error500Page.write(page500)
  },
  afterAll: () => {
    error500Page.delete()
    nextConfig.restore()
  },
}

runDevSuite('Node.js runtime', appDir, nodejsRuntimeBasicSuite)
runProdSuite('Node.js runtime', appDir, nodejsRuntimeBasicSuite)
runDevSuite('Edge runtime', appDir, edgeRuntimeBasicSuite)
runProdSuite('Edge runtime', appDir, edgeRuntimeBasicSuite)
