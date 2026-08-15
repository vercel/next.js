import Link from 'next/link'

export const revalidate = 60

export const generateStaticParams = () => []

export default function Page() {
  const items = Array.from({ length: 50 }, (_, i) => `Item ${i + 1}`)

  return (
    <main id="main-page">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((item, i) => (
          <Link
            key={i}
            href={`?item=${i}`}
            prefetch={false}
            scroll={false}
            id={`link-item-${i}`}
            style={{ padding: 16, border: '1px solid #ccc' }}
          >
            {item}
          </Link>
        ))}
      </div>
    </main>
  )
}
