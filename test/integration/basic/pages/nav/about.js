import Head from 'next/head'
import Link from 'next/link'

export default () => (
  <div className='nav-about'>
    <Head>
      <title>About</title>
    </Head>
    <Link href='/nav'>
      <a id='home-link'>Go Back</a>
    </Link>

    <p>This is the about page.</p>
  </div>
)
