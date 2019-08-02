export const config = { experimentalPrerender: true }

const Page = ({ title }) => <p>{title}</p>

Page.getInitialProps = async () => ({ title: 'something' })

export default Page
