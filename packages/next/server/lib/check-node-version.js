import { printAndExit } from './utils'

const NODE_VERSION = process.version.match(/^v(\d+)/)[1]

if (NODE_VERSION < 7) {
  printAndExit(`> You're using Node.js with version less than 7 which is not supported. Please upgrade to Node.js >= 7.`)
}
