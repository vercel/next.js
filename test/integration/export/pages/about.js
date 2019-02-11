import Link from 'next/link'
import getConfig from 'next/config'
const { publicRuntimeConfig, serverRuntimeConfig } = getConfig()

export default () => (
  <div id='about-page'>
    <div>
      <Link href='/'>
        <a>Go Back</a>
      </Link>
    </div>
    <p>This is the About page</p>
    <p>{publicRuntimeConfig.foo}</p>
    <p>{serverRuntimeConfig.bar}</p>
  </div>
)
