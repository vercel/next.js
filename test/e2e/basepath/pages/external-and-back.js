const Page = ({ from, external }) => (
  <div>
    <p id="from">{from}</p>
    <a href={external}>External link</a>
  </div>
)

Page.getInitialProps = ({ query }) => {
  return {
    from: typeof window === 'undefined' ? 'server' : 'client',
    external: query.external || 'https://example.vercel.sh',
  }
}

export default Page
