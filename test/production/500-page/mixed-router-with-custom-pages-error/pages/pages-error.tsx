export default function PagesPage() {
  throw new Error('pages page error')
  return <p>pages page</p>
}

export async function getServerSideProps() {
  return {
    props: {},
  }
}
