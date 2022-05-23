export function getStaticProps() {
  return { props: {} }
}

function El() {
  return <div />
}

const a = 5

export { El as default, a }
