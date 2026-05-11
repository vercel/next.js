function All({ query }) {
  return <div id="all-ssr-content">{JSON.stringify(query)}</div>
}

All.getInitialProps = ({ query }) => ({ query })

export default All
