const Page = ({ name }) => <div>{`Hello, ${name}`}</div>

Page.getInitialProps = () => ({ name: 'world' })

export default Page
