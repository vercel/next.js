export default function Page() {
  return <div>Page</div>
}

export function getServerSideProps() {
  return { notFound: true }
}
