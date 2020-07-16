export default function Home({ test }) {
  return (
    <div>
      <p>
        Environment variable process.env.SERVER_ONLY is "
        {process.env.SERVER_ONLY}"
      </p>
      <p>"test" prop is "{test}"</p>
      <p>
        Environment variable process.env.NEXT_PUBLIC_SERVER_AND_CLIENT is "
        {process.env.NEXT_PUBLIC_SERVER_AND_CLIENT}"
      </p>
      <p>
        Custom environment variables process.env.BACKEND_URL is "
        {process.env.BACKEND_URL}"
      </p>
    </div>
  )
}

export async function getStaticProps() {
  return {
    props: {
      test: process.env.SERVER_ONLY,
    },
  }
}
