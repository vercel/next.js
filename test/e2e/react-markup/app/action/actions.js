'use server'
import * as ReactMarkup from 'react-markup'

async function Preview() {
  await new Promise((resolve) => {
    setTimeout(() => {
      resolve()
    }, 1000)
  })
  return <div>Hello, Dave!</div>
}

export async function sendEmail() {
  const email = await ReactMarkup.experimental_renderToHTML(<Preview />)
  return { status: 201, email }
}
