type Params = { section: string; topic: string }

export function generateStaticParams() {
  return [{ topic: 'setup' }]
}

export async function markdown({ params }: { params: Promise<Params> }) {
  const { section, topic } = await params
  return `# ${section}/${topic}\n`
}

export default async function Page({ params }: { params: Promise<Params> }) {
  const { section, topic } = await params
  return (
    <h1>
      Guide {section}/{topic}
    </h1>
  )
}
