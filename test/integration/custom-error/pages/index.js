const Page = () => <p>Hello world</p>

Page.getInitialProps = () => {
  throw new Error('oof')
}

export default Page
