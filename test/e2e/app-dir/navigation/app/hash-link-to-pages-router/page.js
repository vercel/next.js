import Link from 'next/link'
import './global.css'

export default function HashPage() {
  return (
    <div style={{ fontFamily: 'sans-serif', fontSize: '16px' }}>
      <p>Hash To Pages Router Page</p>
      <Link href="/some#non-existent" id="link-to-pages-router">
        To pages router
      </Link>
    </div>
  )
}
