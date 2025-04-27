import type { Metadata } from 'next'

export default function Page() {
  return <p>hello world</p>
}

const generateMetadata = async (): Promise<Metadata> => {
  return {
    title: 'Generate Metadata',
  }
}

export { generateMetadata }
