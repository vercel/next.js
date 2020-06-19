const Test2 = () => <h1>Server Test 2</h1>

export async function getServerSideProps() {
  throw new Error('Server Test 2')
}

export default Test2
