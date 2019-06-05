import Link from 'next/link'
import getConfig from 'next/config'
const { publicRuntimeConfig, serverRuntimeConfig } = getConfig()

const About = ({ bar }) => (
  <div id='about-page'>
    <div>
      <Link href='/'>
        <a>Go Back</a>
      </Link>
    </div>
    <p>{`This is the About page ${publicRuntimeConfig.foo}${bar || ''}`}</p>
  </div>
)

About.getInitialProps = async ctx => {
  return { bar: serverRuntimeConfig.bar }
}

export default About
