import { useRouter } from 'next/router'

export default function Gsp(props) {
  if (useRouter().isFallback) {
    return 'Loading...'
  }

  return (
    <>
      <p id="change">change me</p>
      <p id="props">{JSON.stringify(props)}</p>
    </>
  )
}

export const getStaticProps = async ({ params }) => {
  const count = 1

  if (params.post === 'second') {
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }

  return {
    props: {
      count,
      params,
      random: Math.random(),
    },
  }
}

export const getStaticPaths = () => {
  /* eslint-disable-next-line no-unused-vars */
  const paths = 1

  return {
    paths: [{ params: { post: 'first' } }, { params: { post: 'second' } }],
    fallback: true,
  }
}
