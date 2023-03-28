const Page = ({ query }) => <div>{`Query is: ${query}`}</div>

Page.getInitialProps = ({ query }) => {
  return { query: JSON.stringify(query) }
}

export default Page
