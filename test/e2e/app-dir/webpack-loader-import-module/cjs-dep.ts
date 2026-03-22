import metadata from './metadata.json'

interface CjsDep {
  greeting: string
  version: string
}

const dep: CjsDep = {
  greeting: 'hello from cjs',
  version: metadata.version,
}

export default dep
