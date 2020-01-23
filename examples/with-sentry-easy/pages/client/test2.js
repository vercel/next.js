const Test2 = () => <h1>Client Test 2</h1>

Test2.getInitialProps = () =>
  Promise.reject(new Error('Client Error 2 - initialProps Promise Error'))

export default Test2
