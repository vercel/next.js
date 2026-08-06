type Metadata = { title: string }

export default function Page() {
  return <p>hello world</p>
}

export function generateMetadata(): Metadata {
  return {
    title: 'Generate Metadata',
  }
}
