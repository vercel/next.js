import getConfig from 'next/config'
const {serverRuntimeConfig, publicRuntimeConfig} = getConfig()

export default () => <div>
  <p id='server-only'>{serverRuntimeConfig.mySecret}</p>
  <p id='server-and-client'>{publicRuntimeConfig.staticFolder}</p>
</div>
