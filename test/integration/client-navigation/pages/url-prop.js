const Page = ({ url }) => {
  return (
    <div>
      <p id="pathname">{url.pathname}</p>
      <p id="query">{Object.keys(url.query).length}</p>
      <p id="aspath">{url.asPath}</p>
    </div>
  )
}

Page.getInitialProps = () => ({})

export default Page
