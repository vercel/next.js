import Head from 'next/head'
import { useRouter } from 'next/router'

export default function Custom404() {
  const router = useRouter()

  return (
    <>
      <Head>
        <title>404 - Page Not Found</title>
        <meta
          name="description"
          content="The page you're looking for doesn't exist"
        />
      </Head>

      <div className="error-page">
        <h1>404 - Page Not Found</h1>
        <p>The page you&apos;re looking for doesn&apos;t exist.</p>
        <button onClick={() => router.push('/')}>Go Back Home</button>
      </div>
    </>
  )
}
