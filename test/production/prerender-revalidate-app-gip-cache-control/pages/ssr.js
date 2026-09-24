export default function Page() {
  return <p>hello</p>
}

export async function getServerSideProps() {
  return { props: {} }
}
