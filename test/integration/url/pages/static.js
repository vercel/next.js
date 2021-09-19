const url = new URL('../public/vercel.png', import.meta.url).pathname

export default function Index(props) {
  return (
    <div>
      Hello {new URL('../public/vercel.png', import.meta.url).pathname}+{url}
    </div>
  )
}
