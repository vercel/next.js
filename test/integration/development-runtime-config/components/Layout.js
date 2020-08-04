import getConfig from 'next/config'

const {
  serverRuntimeConfig: { mySecret },
} = getConfig()

const Layout = ({ children }) => {
  return (
    <div>
      <h2>mySecret: {mySecret}</h2>
      <div>{children}</div>
    </div>
  )
}

export default Layout
