export default function Page() {
  return <p>seo page</p>
}

export async function generateMetadata() {
  await new Promise((resolve) => setTimeout(resolve, 1000))
  return {
    title: 'SEO Title',
    description: 'SEO Description',
    alternates: {
      canonical: 'https://example.com/seo',
    },
    openGraph: {
      title: 'OG Title',
      description: 'OG Description',
      url: 'https://example.com/seo',
    },
  }
}

export const dynamic = 'force-dynamic'
