import getConfig from 'next/config'
const { serverRuntimeConfig, publicRuntimeConfig } = getConfig()

const NextConfig = () => (
  <div>
    <p id="server-only">{serverRuntimeConfig.mySecret}</p>
    <p id="server-and-client">{publicRuntimeConfig.staticFolder}</p>
    <p id="env">{process.env.customVar}</p>
  </div>
)

export default NextConfig
