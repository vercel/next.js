export default function Page() {
  return <p>This page should never be rendered</p>
}
export const getServerSideProps = async () => {
  throw new Error('Server side error')
}
