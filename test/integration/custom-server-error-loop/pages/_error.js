function Error({ statusCode }) {
  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>Error {statusCode || 'Unknown'}</h1>
      <p>This page should render once and stay stable.</p>
      <p>If you see this flickering or the network tab shows repeated requests, the bug is present.</p>
      <p>Timestamp: {new Date().toISOString()}</p>
    </div>
  )
}

Error.getInitialProps = ({ res, err }) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404
  return { statusCode }
}

export default Error
