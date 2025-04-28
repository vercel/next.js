export default function Page() {
  return <p>hello world</p>
}

export { generateMetadata }

const generateMetadata = async () => {
  return {
    title: 'Generate Metadata',
  }
}
