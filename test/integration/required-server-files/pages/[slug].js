export const getStaticProps = () => {
  return {
    props: {
      hello: 'world',
    },
  }
}

export const getStaticPaths = () => {
  return {
    paths: [],
    fallback: true,
  }
}

export default function Page(props) {
  return <p id="slug-page">[slug] page</p>
}
