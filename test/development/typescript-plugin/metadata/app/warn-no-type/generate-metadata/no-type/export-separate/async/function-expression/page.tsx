export default function Page() {
  return <p>hello world</p>
}

const generateMetadata = async function () {
  return {
    title: 'Generate Metadata',
  }
}

export { generateMetadata }
