export default function Page() {
  return <p>hello world</p>
}

export { generateMetadata }

const generateMetadata = async function () {
  return {
    title: 'Generate Metadata',
  }
}
