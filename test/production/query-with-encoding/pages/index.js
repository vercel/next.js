const Index = ({ query }) => (
  <pre id="query-content">{JSON.stringify(query)}</pre>
)

Index.getInitialProps = ({ query }) => ({ query })

export default Index
