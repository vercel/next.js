export const getStaticPaths = () => ({
  paths: [{ params: { optionalName: [] } }],
  fallback: false,
})

export const getStaticProps = ({ params }) => ({ props: { params } })

export default function Page({ params }) {
  return <div id="success">{params.optionalName ? 'nay' : 'yay'}</div>
}
