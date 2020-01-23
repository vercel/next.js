const doAsyncWork = () =>
  Promise.reject(new Error('Client Error 4 - didMount Error'))
doAsyncWork()

const Test4 = () => <h1>Client Test 4</h1>

export default Test4
