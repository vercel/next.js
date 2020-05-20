import Layout from '../components/layout'
import Spinner from '../components/spinner'
import dynamic from 'next/dynamic'
const UploadForm = dynamic(() => import('../components/upload-form'), {
  ssr: false,
  loading: () => <Spinner />,
})

export default function Home() {
  return (
    <Layout
      title="Welcome to Mux + Next.js"
      description="Get started by uploading a video"
    >
      <UploadForm />
    </Layout>
  )
}
