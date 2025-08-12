export const getServerSideProps = () => {
  throw new Error('fail')
}

export default function Page() {
  return <p>A page with an error</p>
}
