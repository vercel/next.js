let mutatedRes

export async function getServerSideProps(context) {
  mutatedRes = context.res
  return {
    props: (async function () {
      return {
        text: 'res',
      }
    })(),
  }
}

export default ({ text }) => {
  mutatedRes.setHeader('test-header', 'this is a test header')

  return (
    <>
      <div>hello {text}</div>
    </>
  )
}
