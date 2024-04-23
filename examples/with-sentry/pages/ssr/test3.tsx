const Test3 = () => <h1>SSR Test 3</h1>;

export async function getServerSideProps() {
  const doAsyncWork = () => Promise.reject(new Error("SSR Test 3"));

  doAsyncWork();

  return { props: {} };
}

export default Test3;
