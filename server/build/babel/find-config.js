import { join } from 'path'
import buildConfigChain from 'babel-core/lib/transformation/file/options/build-config-chain'

export default function findBabelConfig (dir) {
  // We need to provide a location of a filename inside the `dir`.
  // For the name of the file, we could be provide anything.
  const filename = join(dir, 'filename.js')
  const options = { babelrc: true, filename }

  // First We need to build the config chain.
  // Then we need to remove the config item with the location as "base".
  // That's the config we are passing as the "options" below
  const configList = buildConfigChain(options).filter(i => i.loc !== 'base')

  return configList[0]
}
