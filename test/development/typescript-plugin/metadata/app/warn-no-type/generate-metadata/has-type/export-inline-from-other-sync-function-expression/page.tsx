type Metadata = { title: string }

export default function Page() {
  return <p>hello world</p>
}

export const generateMetadata = function (): Metadata {
  return {
    title: 'Generate Metadata',
  }
}
