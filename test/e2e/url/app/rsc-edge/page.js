import imported from '../../public/vercel.png'
const url = new URL('../../public/vercel.png', import.meta.url).toString()

export default function Index(props) {
  return (
    <main>
      Hello {imported.src}+{url}
    </main>
  )
}

export const runtime = 'edge'
