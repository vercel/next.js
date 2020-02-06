function All({ params }) {
  return <div id="all-ssg-content">{JSON.stringify(params)}</div>
}

export function unstable_getStaticProps({ params }) {
  return { props: { params } }
}

export default All
