export const getStaticProps = () => {
  return {
    props: {
      hello: 'world',
      random: Math.random() + Date.now(),
      page: '[slug]',
    },
  }
}

export const getStaticPaths = () => {
  return {
    paths: ['/first', '/second'],
    fallback: true,
  }
}

export default function Page(props) {
  return <p>[slug] page {JSON.stringify(props)}</p>
}
