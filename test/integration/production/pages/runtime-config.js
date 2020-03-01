import getConfig from 'next/config'

const page = () => {
  const { publicRuntimeConfig, serverRuntimeConfig } = getConfig()

  return (
    <>
      {publicRuntimeConfig && <p>found public config</p>}
      {serverRuntimeConfig && <p>found server config</p>}
    </>
  )
}

page.getInitialProps = () => ({})

export default page
