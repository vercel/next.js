import Link from 'next/link'
export default () => (
  <div>
    <div>Hello World. <Link href='127.0.0.1:3000/about' as='/about'><a>About (Diff Zone)</a></Link></div>
    <div>Hello World. <Link href='/about' as='/about'><a>About (Same Zone)</a></Link></div>
  </div>
)
