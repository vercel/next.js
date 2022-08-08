const Test2 = () => <h1>SSR Test 2</h1>

export async function getServerSideProps() {
  return Promise.reject(Error('SSR Test 2'))
}

export default Test2
