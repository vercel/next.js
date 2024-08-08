import { get } from 'node:https'

export default function Page({ text }) {
  return <pre>{text}</pre>
}

export async function getServerSideProps() {
  const text = await new Promise<string>((resolve, reject) => {
    get('https://example.com', (res) => {
      let data = ''
      res.on('data', (chunk) => {
        data += chunk
      })
      res.on('end', () => {
        resolve(data)
      })
    }).on('error', (err) => {
      reject(err)
    })
  })
  return {
    props: { text },
  }
}
