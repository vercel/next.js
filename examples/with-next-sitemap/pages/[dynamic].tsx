import { GetStaticPaths, GetStaticProps } from 'next'
import { useRouter } from 'next/router'

const DynamicPage = () => {
  const { query } = useRouter()

  return (
    <div>
      <h1>Dynamic Page</h1>
      <h2>Query: {query.dynamic}</h2>
    </div>
  )
}

export const getStaticProps: GetStaticProps = async () => {
  return {
    props: {
      dynamic: 'hello',
    },
  }
}

export const getStaticPaths: GetStaticPaths = async () => {
  return {
    paths: [...Array(10000)].map((_, index) => ({
      params: {
        dynamic: `page-${index}`,
      },
    })),
    fallback: false,
  }
}

export default DynamicPage
