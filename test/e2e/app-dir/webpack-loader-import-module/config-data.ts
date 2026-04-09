import cjsDep from './cjs-dep'
import { label as esmLabel } from './esm-dep.mjs'

interface Config {
  title: string
  items: string[]
  cjsGreeting: string
  version: string
  esmLabel: string
}

const config: Config = {
  title: 'Import Module Works',
  items: ['apple', 'banana', 'cherry'],
  cjsGreeting: cjsDep.greeting,
  version: cjsDep.version,
  esmLabel,
}

export default config
