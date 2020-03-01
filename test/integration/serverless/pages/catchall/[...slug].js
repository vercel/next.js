const SlugPage = ({ query }) => <div>{JSON.stringify(query)}</div>

SlugPage.getInitialProps = ({ query }) => ({ query })

export default SlugPage
