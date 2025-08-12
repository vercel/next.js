export default function Page(props) {
  return <p>another page</p>
}

export const getServerSideProps = () => {
  return {
    props: {
      hello: 'world',
      random: Math.random() + Date.now(),
    },
  }
}
