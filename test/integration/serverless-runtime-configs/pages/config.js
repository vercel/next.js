import getConfig from 'next/config'

const config = getConfig()

const page = () => <p id="config">{JSON.stringify(config)}</p>

page.getInitialProps = () => ({ a: 'b' })

export default page
