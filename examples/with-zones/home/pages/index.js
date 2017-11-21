import Link from 'next/link'
export default () => (
  <div>
    <h2>Our Homepage</h2>
    <div><Link href='localhost:5000/blog' as='/blog'><a>Blog</a></Link></div>
    <div><Link href='localhost:4000/about' as='/about'><a>About us</a></Link></div>
  </div>
)
