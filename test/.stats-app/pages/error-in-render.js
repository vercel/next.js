const Page = () => 'Hello world 👋'

Page.getInitialProps = () => {
  throw new Error('oof')
}

export default Page
