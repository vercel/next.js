export default async function Page() {
  return <div>Page</div>
}

export function getServerSideProps() {
  return {
    props: {},
  }
}
