let mutatedResNoStreaming

export async function getServerSideProps(context) {
  mutatedResNoStreaming = context.res
  return {
    props: {
      text: 'res',
    },
  }
}

export default ({ text }) => {
  mutatedResNoStreaming.setHeader('test-header', 'this is a test header')

  return (
    <>
      <div>hello {text}</div>
    </>
  )
}
