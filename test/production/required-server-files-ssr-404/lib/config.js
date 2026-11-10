let curConfig

const idk = Math.random()

export default () => {
  console.log('returning config', idk, curConfig)
  return curConfig
}

export function setConfig(configValue) {
  curConfig = configValue
  console.log('set config', idk, configValue)
}
