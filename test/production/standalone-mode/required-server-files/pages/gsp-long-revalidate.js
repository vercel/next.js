import fs from 'fs'
import path from 'path'

let gspCalls = 0

export async function getStaticProps() {
  const data = await fs.promises.readFile(
    path.join(process.cwd(), 'data.txt'),
    'utf8'
  )
  gspCalls += 1

  if (data.trim() === 'hide') {
    return {
      notFound: true,
      revalidate: 1,
    }
  }

  return {
    props: {
      hello: 'world',
      data,
      gspCalls,
    },
    revalidate: 100,
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
