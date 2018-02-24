let env

export default () => {
  return env
}

export function setConfig (configValue) {
  env = configValue
}
