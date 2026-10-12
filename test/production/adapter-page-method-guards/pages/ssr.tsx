export async function getServerSideProps() {
  console.log('__pages-ssr-gssp__')
  return { props: {} }
}

export default function Page() {
  return <p>pages ssr page</p>
}
