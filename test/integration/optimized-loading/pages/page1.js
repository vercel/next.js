const Page1 = () => <h1>Hello World!</h1>
export default Page1

export const getServerSideProps = () => {
  return {
    props: {
      hello: 'world',
    },
  }
}
