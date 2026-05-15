const Page = ({ pid }) => <div>{`Post - ${pid}`}</div>

Page.getInitialProps = ({ query }) => {
  return { pid: query.pid }
}

export default Page
