const Test1 = () => <h1>Client Test 1</h1>

Test1.getInitialProps = () => {
  throw new Error('Client Error 1 - initialProps Error')
}

export default Test1
