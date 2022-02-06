export async function getServerSideProps(context) {
  return {
    props: (async function () {
      // Mimic some async work, like getting data from an API
      await new Promise((resolve) => setTimeout(resolve))
      context.res.setHeader('test-header', 'this is a test header')
      return {
        text: 'res',
      }
    })(),
  }
}

export default ({ text }) => {
  return (
    <>
      <div>hello {text}</div>
    </>
  )
}
