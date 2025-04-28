export default function Page() {
  return <p>hello world</p>
}

export { generateMetadata }

const generateMetadata = () => {
  return {
    title: 'Generate Metadata',
  }
}
