import cjsDep from './cjs-dep'

interface Config {
  title: string
  items: string[]
  cjsGreeting: string
  version: string
}

const config: Config = {
  title: 'Import Module Works',
  items: ['apple', 'banana', 'cherry'],
  cjsGreeting: cjsDep.greeting,
  version: cjsDep.version,
}

export default config
