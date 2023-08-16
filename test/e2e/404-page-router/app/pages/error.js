export default function Page() {
  throw new Error('there was an error')
}

export const getServerSideProps = () => {
  return { props: {} }
}
