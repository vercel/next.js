function All({ params }) {
  return <div id="all-ssg-content">{JSON.stringify(params)}</div>
}

export function unstable_getStaticProps({ params }) {
  return { props: { params } }
}

export function unstable_getStaticPaths() {
  return [
    `/p1/p2/predefined-ssg/one-level`,
    `/p1/p2/predefined-ssg/1st-level/2nd-level`,
  ]
}

export default All
