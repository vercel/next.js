import getConfig from 'next/config'

const { serverRuntimeConfig, publicRuntimeConfig } = getConfig()

const Layout = ({ children }) => {
  return (
    <div>
      <p id="server-runtime-config">{JSON.stringify(serverRuntimeConfig)}</p>
      <p id="public-runtime-config">{JSON.stringify(publicRuntimeConfig)}</p>
      <div>{children}</div>
    </div>
  )
}

export default Layout
