export default function Page() {
  return <p>hello world</p>
}

const generateMetadata = async () => {
  return {
    title: 'Generate Metadata',
  }
}

export { generateMetadata }
