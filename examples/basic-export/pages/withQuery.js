export default (props) => (
  <div>
    <h1>Route with query</h1>
    <p>props.url.query</p>
    <pre>{JSON.stringify(props.url.query, null, '  ')}</pre>
  </div>
)
