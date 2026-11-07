export default function Page() {
  return <p>ssr page</p>
}

export function getServerSideProps() {
  return { props: {} }
}
