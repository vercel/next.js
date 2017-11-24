import asset from 'next/asset'
import Link from 'next/link'

export default () => (
  <div>
    <p>This is the about page.</p>
    <div><Link href='/'><a>Go Back</a></Link></div>
    <img width={200} src={asset('/zeit.png')} />
  </div>
)
