const Test2 = () => <h1>SSR Test 2</h1>

export async function getServerSideProps() {
  throw new Error('SSR Test 2')
}

export default Test2
