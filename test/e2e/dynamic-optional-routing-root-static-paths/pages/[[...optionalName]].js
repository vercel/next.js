export const getStaticPaths = () => ({
  paths: [
    { params: { optionalName: [] } },
    { params: { optionalName: ['one'] } },
    { params: { optionalName: ['one', 'two'] } },
  ],
  fallback: false,
})

export const getStaticProps = ({ params }) => ({ props: { params } })

export default function Page({ params }) {
  return (
    <div id="success">
      {params.optionalName ? params.optionalName.join(',') : 'yay'}
    </div>
  )
}
