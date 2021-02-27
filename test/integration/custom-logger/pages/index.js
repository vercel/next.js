export const getServerSideProps = ({ req }) => {
  if (req.url === '/index?error=true') {
    throw new Error('error from app')
  }
  return {
    props: {},
  }
}

const Page = () => 'hi'

export default Page
