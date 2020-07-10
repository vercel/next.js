const doAsyncWork = () => Promise.reject(new Error('Server Test 4'))
doAsyncWork()

const Test4 = () => <h1>Server Test 4</h1>

// Define getServerSideProps so that the page will be server rendered
// instead of statically generated
export async function getServerSideProps() {
  return { props: {} }
}

export default Test4
