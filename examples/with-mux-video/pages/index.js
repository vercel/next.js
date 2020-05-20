import Layout from '../components/layout'
import UploadForm from '../components/upload-form'

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
