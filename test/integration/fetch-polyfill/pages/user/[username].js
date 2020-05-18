export default function StaticPage({ data }) {
  return <div id="username">{data.from}</div>
}

const port = process.env.NEXT_PUBLIC_API_PORT

export async function getStaticPaths() {
  const res = await fetch(`http://localhost:${port}/usernames`)
  const { usernames } = await res.json()

  return {
    fallback: false,
    paths: usernames.map((username) => {
      return {
        params: {
          username,
        },
      }
    }),
  }
}

export async function getStaticProps({ params }) {
  const res = await fetch(
    `http://localhost:${port}/usernames/${params.username}`
  )
  const json = await res.json()
  return {
    props: {
      data: json,
    },
  }
}
