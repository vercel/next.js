export default function Redirector() {
  return (
    <main>
      <h1>Hello world</h1>
    </main>
  )
}

export const getServerSideProps = ({ query }) => {
  return {
    redirect: {
      destination: `${query.redirect}?message=${query.message}`,
      permanent: false,
    },
  }
}
