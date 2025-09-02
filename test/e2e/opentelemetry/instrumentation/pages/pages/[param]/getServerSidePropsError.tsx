export default function Page() {
  return <div>Page</div>
}

export function getServerSideProps() {
  throw new Error('ServerSideProps error')
}
