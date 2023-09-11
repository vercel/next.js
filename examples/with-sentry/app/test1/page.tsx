const doAsyncWork = () => Promise.reject(new Error('Client Test 1'))
doAsyncWork()

const Test1 = () => (
  <div>
    <h1>Test 1</h1>
    <p>Error thrown in code outside component.</p>
  </div>
)

export default Test1
