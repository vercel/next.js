const Page = ({ data }) => <p>{data} world</p>

Page.getInitialProps = () => ({ data: 'hello' })

export default Page
