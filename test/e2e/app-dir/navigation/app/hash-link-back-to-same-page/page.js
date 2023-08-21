import Link from 'next/link'
import '../hash/global.css'

export default function HashPage() {
  // Create list of 5000 items that all have unique id
  const items = Array.from({ length: 5000 }, (_, i) => ({ id: i }))

  return (
    <div style={{ fontFamily: 'sans-serif', fontSize: '16px' }}>
      <p>Hash Page</p>
      <Link href="/hash-link-back-to-same-page#hash-6" id="link-to-6">
        To 6
      </Link>
      <Link href="/hash-link-back-to-same-page#hash-50" id="link-to-50">
        To 50
      </Link>
      <Link href="/hash-link-back-to-same-page#hash-160" id="link-to-160">
        To 160
      </Link>
      <div>
        {items.map((item) => {
          if (item.id === 160) {
            return (
              <>
                <div key={item.id}>
                  <div id={`hash-${item.id}`}>{item.id}</div>
                </div>
                <div key="to-other-page">
                  <div>
                    <Link
                      href="/hash-link-back-to-same-page/other"
                      id="to-other-page"
                    >
                      To other page
                    </Link>
                  </div>
                </div>
              </>
            )
          }
          return (
            <div key={item.id}>
              <div id={`hash-${item.id}`}>{item.id}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
