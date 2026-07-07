export default ({ url }) => (
  <>
    <h1>root catch-all</h1>
    <p id="url">{url}</p>
  </>
)

export const getServerSideProps = ({ req, res }) => {
  return {
    props: {
      url: req.url,
    },
  }
}
