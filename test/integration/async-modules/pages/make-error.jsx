export async function getServerSideProps() {
  throw new Error('BOOM')
}

export default function Page() {
  return <div>hello</div>
}
