const Page = ({ name }) => <p>Pre-render page {name}</p>

Page.getInitialProps = async () => ({ name: 'John Deux' })

export const config = { prerender: true }

export default Page
