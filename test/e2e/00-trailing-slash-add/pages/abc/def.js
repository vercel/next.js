export default function Page() {
  return <p>nested page</p>
}

export const getServerSideProps = () => {
  return {
    props: {
      hello: 'world',
    },
  }
}
