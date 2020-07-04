export async function getServerSideProps() {
  // we will use this route to simulate a route error by clicking it
  // twice in rapid succession
  await new Promise((resolve) => setTimeout(resolve, 10000))
  return { props: {} }
}

export default function Page() {
  return null
}
