const Page = () => "I'm SSRed"

Page.getInitialProps = () => ({ hello: 'world' })

export default Page
