export async function getStaticProps() {
  return {
    props: {
      url: new URL('../../public/vercel.png', import.meta.url).pathname,
    },
  }
}

export default function Index({ url }) {
  return (
    <main>
      Hello {new URL('../../public/vercel.png', import.meta.url).pathname}+{url}
    </main>
  )
}
