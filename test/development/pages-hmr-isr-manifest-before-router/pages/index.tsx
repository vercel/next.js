export default function Page() {
  return <p>hello world</p>
}

// Makes the page dynamic, so the dev tools indicator has to be computed from
// the router state after mount instead of being left at its default.
export async function getServerSideProps() {
  return { props: {} }
}
