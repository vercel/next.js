export default () => <h1>Hello World!</h1>

export const getServerSideProps = () => {
  return {
    props: {
      hello: 'world',
    },
  }
}
