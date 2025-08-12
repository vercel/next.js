export default function Page(props) {
  return <p>pages/trigger-error</p>
}

export function getServerSideProps() {
  throw new Error('custom error')
}
