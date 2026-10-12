import fs from 'fs'
import path from 'path'

export async function getStaticProps() {
  const data = await fs.promises.readFile(
    path.join(process.cwd(), 'data.txt'),
    'utf8'
  )

  console.log('revalidate', { data })

  return {
    props: { data },
    notFound: data.trim() === '404',
    revalidate: 1,
  }
}

export default function Page({ data }) {
  return <p id="data">{data}</p>
}
