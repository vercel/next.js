import fs from 'fs'
import path from 'path'

export async function getServerSideProps({ res }) {
  res.setHeader('cache-control', 's-maxage=1, stale-while-revalidate')

  const data = await fs.promises.readFile(
    path.join(process.cwd(), 'data.txt'),
    'utf8'
  )

  if (data.trim() === 'hide') {
    return {
      notFound: true,
    }
  }

  return {
    props: {
      hello: 'world',
      data,
    },
  }
}

export default function Page(props) {
  return (
    <>
      <p id="gsp">getStaticProps page</p>
      <p id="props">{JSON.stringify(props)}</p>
    </>
  )
}
