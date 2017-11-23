import Link from 'next/link'
export default () => (
  <div>
    <h2>Our Homepage 3333</h2>
    <div><Link href='/blog' as='/blog'><a>Blog</a></Link></div>
    <div><Link href='/about' as='/about'><a>About us</a></Link></div>
  </div>
)
