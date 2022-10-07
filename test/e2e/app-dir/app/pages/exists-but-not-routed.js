export async function getServerSideProps() {
  return {
    props: {
      message: 'Hello World!',
    },
  }
}

export default function Page({ message }) {
  return (
    <>
      <p>hello from exists but not routed {message}</p>
    </>
  )
}
