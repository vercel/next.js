export default function Page() {
  return <div>About Page</div>
}

export async function generateMetadata() {
  await new Promise((resolve) => setTimeout(resolve, 3 * 1000))
  return {
    title: 'About title',
    description: 'About description',
    applicationName: 'suspense-app',
    generator: 'next.js',
    referrer: 'origin-when-cross-origin',
    keywords: ['next.js', 'react', 'javascript'],
    authors: [{ name: 'huozhi' }, { name: 'tree', url: 'https://tree.com' }],
    manifest: '/api/manifest',
    creator: 'shu',
    publisher: 'vercel',
    robots: 'index, follow',
    alternates: {},
    formatDetection: {
      email: false,
      address: false,
      telephone: false,
    },
  }
}
