const Page = ({ name }) => <p>Prerender page {name}</p>

Page.getInitialProps = async () => ({ name: 'John Deux' })

export const config = { experimentalPrerender: true }

export default Page
