type Metadata = { title: string }

export default function Page() {
  return <p>hello world</p>
}

const generateMetadata = async function (): Promise<Metadata> {
  return {
    title: 'Generate Metadata',
  }
}

export { generateMetadata }
