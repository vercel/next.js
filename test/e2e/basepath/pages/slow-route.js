export async function getServerSideProps() {
  // We will use this route to simulate a route cancellation error
  // by clicking its link twice in rapid succession
  await new Promise((resolve) => setTimeout(resolve, 5000))
  return { props: {} }
}

export default function Page() {
  return null
}
