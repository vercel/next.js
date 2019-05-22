import { withRouter } from 'next/router'

const Page = ({ router: { query } }) => (
  <>
    <p id={'q' + query.id}>{query.id}</p>
    <a id='first' href='/query?id=1'>Go to ?id=1</a>
    <a id='second' href='/query?id=2'>Go to ?id=2</a>
  </>
)

Page.getInitialProps = () => ({})

export default withRouter(Page)
