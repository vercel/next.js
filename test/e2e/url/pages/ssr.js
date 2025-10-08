export function getServerSideProps() {
  return {
    props: {
      url: new URL('../public/vercel.png', import.meta.url).pathname,
    },
  }
}

export default function Index({ url }) {
  return (
    <div>
      Hello {new URL('../public/vercel.png', import.meta.url).pathname}+{url}
    </div>
  )
}
