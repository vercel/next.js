import fs from 'fs'
import path from 'path'

export async function getServerSideProps() {
  // `linked-dir` is a symlink with an absolute target that the test creates
  // before the build. The standalone output must still resolve it after the
  // original project directory is removed.
  const data = await fs.promises.readFile(
    path.join(process.cwd(), 'linked-dir/data.txt'),
    'utf8'
  )

  return {
    props: {
      data: data.trim(),
    },
  }
}

export default function Page({ data }) {
  return <p id="linked-data">{data}</p>
}
