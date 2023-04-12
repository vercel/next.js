import { ExtendedNextPage } from './_app'
import { GetServerSideProps } from 'next'

const Home: ExtendedNextPage = () => {
  return null
}

export default Home

export const getServerSideProps: GetServerSideProps<{}> = async (context) => {
  return {
    redirect: {
      destination: '/posts',
      permanent: false,
    },
  }
}

Home.noLayout = true
