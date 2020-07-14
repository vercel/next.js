import { useRouter } from 'next/router'

export const getStaticPaths = () => ({
  paths: [],
  fallback: true,
})

export const getStaticProps = ({ params }) => ({ props: { params } })

export default function Page({ params }) {
  const r = useRouter()
  if (r.isFallback) {
    return <div>loading</div>
  }

  return (
    <div id="success">
      {params.optionalName ? params.optionalName.join(',') : 'yay'}
    </div>
  )
}
