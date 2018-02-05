import Link from 'next/link'
export default () => (
  <div>
    <div>About us</div>
    <div>Back to <Link href='/' as={process.env.BACKEND_URL + '/'}><a>Home</a></Link></div>
  </div>
)
