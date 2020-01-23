const Test3 = () => <h1>Client Test 3</h1>

Test3.getInitialProps = () => {
  const doAsyncWork = () =>
    Promise.reject(new Error('Client Error 3 - initialProps Async Error'))

  doAsyncWork()

  return {}
}

export default Test3
