function All({ params }) {
  return <div id="all-ssg-content">{JSON.stringify(params)}</div>
}

export function getStaticProps({ params }) {
  return { props: { params } }
}

export function getStaticPaths() {
  return {
    paths: [],
    fallback: true,
  }
}

export default All
