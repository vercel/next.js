export async function getServerSideProps() {
  // We will use this route to simulate a route change errors
  throw new Error('KABOOM!')
}

export default function Page() {
  return null
}
