function Page1 () {
  return <p id='page-text'>1</p>
}

Page1.getInitialProps = async function getInitialProps () {
  await new Promise(resolve => setTimeout(resolve, 5000))
  return {}
}

export default Page1
