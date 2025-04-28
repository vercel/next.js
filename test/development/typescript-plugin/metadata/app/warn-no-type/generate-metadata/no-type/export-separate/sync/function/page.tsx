export default function Page() {
  return <p>hello world</p>
}

export { generateMetadata }

function generateMetadata() {
  return {
    title: 'Generate Metadata',
  }
}
