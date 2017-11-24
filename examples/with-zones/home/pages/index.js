import Link from 'next/link'
import asset from 'next/asset'

export default () => (
  <div>
    <h2>Our Homepage </h2>
    <div><Link href='/blog' as='/blog'><a>Blog</a></Link></div>
    <div><Link href='/about' as='/about'><a>About us</a></Link></div>
    <img width={200} src={asset('/nextjs.png')} />
  </div>
)
