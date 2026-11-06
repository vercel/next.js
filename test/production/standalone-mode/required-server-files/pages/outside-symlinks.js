import fs from 'fs'
import path from 'path'

export async function getServerSideProps() {
  // Both links point outside of the project directory. The test creates
  // them before the build and removes their targets after the build.
  const file = await fs.promises.readFile(
    path.join(process.cwd(), 'outside-file.txt'),
    'utf8'
  )

  // A directory target outside of the tracing root cannot be copied. The
  // read only makes the build trace the link so that it warns.
  let dir = 'missing'
  try {
    dir = await fs.promises.readFile(
      path.join(process.cwd(), 'outside-dir/data.txt'),
      'utf8'
    )
  } catch {}

  return {
    props: {
      file: file.trim(),
      dir: dir.trim(),
    },
  }
}

export default function Page({ file, dir }) {
  return (
    <>
      <p id="outside-file">{file}</p>
      <p id="outside-dir">{dir}</p>
    </>
  )
}
