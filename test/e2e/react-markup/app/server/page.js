import * as ReactMarkup from 'react-markup'

async function Preview() {
  await new Promise((resolve) => {
    setTimeout(() => {
      resolve()
    }, 1000)
  })
  return <div>Hello, Dave!</div>
}

export default async function Page() {
  const html = await ReactMarkup.experimental_renderToHTML(<Preview />)
  return <pre>{html}</pre>
}
