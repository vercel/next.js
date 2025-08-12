export const getStaticProps = ({ params }) => {
  if (params.slug === 'idk') {
    return {
      notFound: true,
    }
  }

  return {
    props: {
      hello: 'world',
      slug: params.slug,
      random: Math.random() + Date.now(),
    },
  }
}

export const getStaticPaths = () => {
  return {
    paths: ['/fallback-blocking/first', '/fallback-blocking/on-demand-1'],
    fallback: 'blocking',
  }
}

export default function Page(props) {
  return (
    <>
      <p id="fallback">fallback page</p>
      <p id="slug">{props.slug}</p>
      <p id="props">{JSON.stringify(props)}</p>
    </>
  )
}
