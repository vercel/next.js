const Page = () => 'Hello world 👋'

// we add getServerSideProps to prevent statically optimize
// to allow us to compare server-side changes
export const getServerSideProps = () => {
  return {
    props: {},
  }
}

export default Page
