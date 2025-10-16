'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'

export default function Page() {
  const params = useParams()

  // Content that changes based on the slug
  const getContent = (slug) => {
    switch (slug) {
      case 'first':
        return {
          title: 'First Post - Client Dynamic Route',
          description: 'This is the FIRST post rendered client-side with SPA-style routing.',
          color: '#e3f2fd',
          icon: '🥇'
        }
      case 'second':
        return {
          title: 'Second Post - Client Dynamic Route',
          description: 'This is the SECOND post rendered client-side with SPA-style routing.',
          color: '#f3e5f5',
          icon: '🥈'
        }
      case 'shell-test':
        return {
          title: 'Shell Test - Content Corruption Check',
          description: 'This content contains the literal text __shell__ to verify it does NOT get replaced during patching. The __shell__ placeholder should remain as-is in actual content.',
          color: '#fff9c4',
          icon: '🐚'
        }
      default:
        return {
          title: `Post: ${slug}`,
          description: `This is a client-side dynamic route for "${slug}".`,
          color: '#fff3e0',
          icon: '📄'
        }
    }
  }

  const content = getContent(params.slug)

  return (
    <main>
      <div style={{ backgroundColor: content.color, padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
        <h1 id="slug">{content.icon} {content.title}</h1>
        <p id="description" style={{ fontSize: '18px', fontWeight: 'bold' }}>{content.description}</p>
        <p style={{ fontSize: '14px', color: '#666' }}>Slug parameter: <code>{params.slug}</code></p>
      </div>
      <nav>
        <h2>Navigate to other posts:</h2>
        <ul>
          <li>
            <Link href="/client-dynamic/first">🥇 First Post</Link>
          </li>
          <li>
            <Link href="/client-dynamic/second">🥈 Second Post</Link>
          </li>
          <li>
            <Link href="/client-dynamic/third">Third Post (arbitrary)</Link>
          </li>
          <li>
            <Link href="/">← Back to Home</Link>
          </li>
        </ul>
      </nav>
    </main>
  )
}
