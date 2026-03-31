import imported from '../../public/vercel.png'

export function getServerSideProps() {
  return {
    props: {
      url: new URL('../../public/vercel.png', import.meta.url).toString(),
    },
  }
}

export default function Index({ url }) {
  return (
    <main>
      Hello {imported.src}+
      {new URL('../../public/vercel.png', import.meta.url).toString()}+{url}
    </main>
  )
}

export const runtime = 'experimental-edge'
