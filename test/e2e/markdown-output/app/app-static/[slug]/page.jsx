export const markdown = true

export async function generateStaticParams() {
  return [{ slug: 'alpha' }]
}

export default async function AppStaticPage({ params }) {
  const { slug } = await params

  return (
    <main>
      <h1>App Static {slug}</h1>
      <p>Static paragraph {slug}</p>
    </main>
  )
}
