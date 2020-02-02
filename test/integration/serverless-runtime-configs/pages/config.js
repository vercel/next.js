import getConfig from 'next/config'

const config = getConfig()

export default () => <p id="config">{JSON.stringify(config)}</p>
