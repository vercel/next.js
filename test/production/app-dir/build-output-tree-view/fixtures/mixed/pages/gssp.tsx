export default function Page() {
  return <p>hello world</p>
}

export async function getServerSideProps() {
  return { props: {} }
}
