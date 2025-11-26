import { useRouter } from 'next/router'

function Page(props) {
  if (useRouter().isFallback) {
    return <p>loading...</p>
  }
  return <p>here comes an error</p>
}

export const getStaticPaths = () => {
  return {
    paths: [],
    fallback: true,
  }
}

export const getStaticProps = ({ params }) => {
  if (params.post === 'crash') {
    throw new Error('gsp hit an oops')
  }
  return {
    props: {
      hello: 'world',
    },
  }
}

export default Page
