export default function Page() {
  return <p>hello world</p>
}

export { generateMetadata }

async function generateMetadata() {
  return {
    title: 'Generate Metadata',
  }
}
