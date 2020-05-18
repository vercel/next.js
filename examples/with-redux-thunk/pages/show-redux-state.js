import { connect } from 'react-redux'
import Link from 'next/link'

const codeStyle = {
  background: '#ebebeb',
  width: 400,
  padding: 10,
  border: '1px solid grey',
  marginBottom: 10,
}

const ShowReduxState = (state) => (
  <>
    <pre style={codeStyle}>
      <code>{JSON.stringify(state, null, 4)}</code>
    </pre>
    <Link href="/">
      <a>Go Back Home</a>
    </Link>
  </>
)

const mapDispatchToProps = (state) => state

export default connect(mapDispatchToProps)(ShowReduxState)
