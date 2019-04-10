const Page = ({ from }) => (
  <div>
    <p>{from}</p>
    <a href='https://google.com'>External link</a>
  </div>
)

Page.getInitialProps = () => {
  return { from: typeof window === 'undefined' ? 'server' : 'client' }
}

export default Page
