function Page({ message }) {
  return <div>{message}</div>
}

Page.getInitialProps = async ({ req }) => {
  return {
    message: 'Hello World!!!',
  }
}

export default Page
