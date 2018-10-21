import Link from 'next/link'

export default () => (
  <div>
    <p>Index Page</p>
    <Link href='/about'>
      <a id='about-link'>About Page</a>
    </Link>
  </div>
)
