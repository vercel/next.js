export default function Page() {
  return <p>slow</p>
}

export async function generateMetadata() {
  await new Promise((resolve) => setTimeout(resolve, 3 * 1000))
  return {
    title: 'slow page',
    description: 'slow page description',
    generator: 'next.js',
    applicationName: 'test',
    referrer: 'origin-when-cross-origin',
    keywords: ['next.js', 'react', 'javascript'],
    authors: [{ name: 'huozhi' }],
    creator: 'huozhi',
    publisher: 'vercel',
    robots: 'index, follow',
  }
}

export const dynamic = 'force-dynamic'
