const Test1 = () => <h1>Server Test 1</h1>

export function getServerSideProps() {
  throw new Error('Server Test 1')
}

export default Test1
