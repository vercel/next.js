import * as config from './config'

export default function NotActualInstantConfig() {
  return <pre data-testid="config">{JSON.stringify(config)}</pre>
}
