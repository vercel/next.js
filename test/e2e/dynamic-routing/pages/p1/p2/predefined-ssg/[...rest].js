function All({ params }) {
  return <div id="all-ssg-content">{JSON.stringify(params)}</div>
}

export function getStaticProps({ params }) {
  return { props: { params } }
}

export function getStaticPaths() {
  return {
    paths: [
      `/p1/p2/predefined-ssg/one-level`,
      `/p1/p2/predefined-ssg/1st-level/2nd-level`,
    ],
    fallback: true,
  }
}

export default All
