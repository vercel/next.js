type Metadata = { title: string }

export default function Page() {
  return <p>hello world</p>
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Generate Metadata',
  }
}
