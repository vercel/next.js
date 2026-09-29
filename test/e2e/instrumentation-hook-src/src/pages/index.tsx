export default function Page() {
  return <p>hello world</p>
}

// Invoke a Node function in deploy mode so the instrumentation hook runs.
export function getServerSideProps() {
  return { props: {} }
}
