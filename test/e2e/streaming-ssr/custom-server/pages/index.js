export default function Page() {
  return <p>streaming</p>
}

export async function getServerSideProps() {
  return { props: {} }
}
