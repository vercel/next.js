export function getStaticProps() {
  return { props: {} }
}

class El extends React.Component {
  render() {
    return <div />
  }
}

const a = 5

export { El as default, a }
