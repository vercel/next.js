import { Suspense } from 'react'
import { connection } from 'next/server'
import Link from 'next/link'

function Skeleton({
  width,
  height,
  style,
}: {
  width: string | number
  height: number
  style?: React.CSSProperties
}) {
  return (
    <div
      className="skeleton"
      style={{
        width,
        height,
        borderRadius: 4,
        background: 'linear-gradient(90deg, #eee 25%, #ddd 50%, #eee 75%)',
        backgroundSize: '800px 100%',
        animation: 'shimmer 1.5s ease-in-out infinite',
        ...style,
      }}
    />
  )
}

async function DynamicComments() {
  await connection()

  const comments = [
    { author: 'Alice', text: 'This loaded dynamically via streaming.' },
    {
      author: 'Bob',
      text: 'With Instant Navigation Mode on, you would see the skeleton instead.',
    },
    {
      author: 'Charlie',
      text: 'Click the "Instant UI only" indicator to unblock dynamic data.',
    },
  ]

  return (
    <div data-testid="dynamic-content">
      {comments.map((c, i) => (
        <div
          key={i}
          style={{
            padding: '0.75rem',
            borderBottom: '1px solid #eee',
          }}
        >
          <strong>{c.author}</strong>
          <p style={{ margin: '0.25rem 0 0' }}>{c.text}</p>
        </div>
      ))}
    </div>
  )
}

function CommentsSkeleton() {
  return (
    <div data-testid="comments-skeleton">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            padding: '0.75rem',
            borderBottom: '1px solid #eee',
          }}
        >
          <Skeleton width={80} height={14} />
          <Skeleton width="90%" height={14} style={{ marginTop: 8 }} />
        </div>
      ))}
    </div>
  )
}

export default function TargetPage() {
  return (
    <div>
      <style>{`
        @keyframes shimmer {
          0% { background-position: -400px 0; }
          100% { background-position: 400px 0; }
        }
      `}</style>
      <h1>Target Page</h1>
      <p>
        The heading and this paragraph are static — they appear instantly. The
        comments below are dynamic and stream in after the shell.
      </p>
      <h2 style={{ fontSize: '1.1rem', marginTop: '1.5rem' }}>Comments</h2>
      <div
        style={{
          border: '1px solid #eee',
          borderRadius: 8,
          overflow: 'hidden',
          marginBottom: '1.5rem',
        }}
      >
        <Suspense fallback={<CommentsSkeleton />}>
          <DynamicComments />
        </Suspense>
      </div>
      <nav>
        <Link
          href="/"
          style={{
            display: 'inline-block',
            padding: '0.5rem 1rem',
            background: '#0070f3',
            color: '#fff',
            borderRadius: 6,
            textDecoration: 'none',
          }}
        >
          &larr; Back to home
        </Link>
      </nav>
    </div>
  )
}
