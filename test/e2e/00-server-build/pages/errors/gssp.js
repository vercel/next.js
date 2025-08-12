function Page(props) {
  return <p>here comes an error</p>
}

export const getServerSideProps = ({ query }) => {
  if (query.crash) {
    throw new Error('gssp hit an oops')
  }
  return {
    props: {
      hello: 'world',
    },
  }
}

export default Page
