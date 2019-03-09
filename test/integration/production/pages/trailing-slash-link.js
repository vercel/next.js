import Link from 'next/link'

export default () => (
  <div className='trailing-slash-link'>
    <Link href='/subfolder/'>
      <a id='home-link'>Go Back</a>
    </Link>

    <p>This page has a link to an index.js page, called with a trailing /.</p>
  </div>
)
