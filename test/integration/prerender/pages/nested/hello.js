export const config = { experimentalPrerender: 'inline' }

const Page = ({ title }) => <p>{title}</p>

Page.getInitialProps = async () => ({ title: 'something' })

export default Page
