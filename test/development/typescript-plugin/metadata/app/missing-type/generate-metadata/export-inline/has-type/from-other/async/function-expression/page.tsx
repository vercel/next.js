type Metadata = { title: string }

export default function Page() {
  return <p>hello world</p>
}

export const generateMetadata = async function (): Promise<Metadata> {
  return {
    title: 'Generate Metadata',
  }
}
