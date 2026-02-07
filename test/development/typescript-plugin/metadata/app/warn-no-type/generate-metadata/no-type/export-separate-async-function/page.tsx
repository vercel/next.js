export default function Page() {
  return <p>hello world</p>
}

async function generateMetadata() {
  return {
    title: 'Generate Metadata',
  }
}

export { generateMetadata }
