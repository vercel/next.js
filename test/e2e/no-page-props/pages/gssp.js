export default function Gssp() {
  return <p id="gssp">getServerSideProps</p>
}

export const getServerSideProps = () => {
  return {
    props: {
      hello: 'world',
    },
  }
}
