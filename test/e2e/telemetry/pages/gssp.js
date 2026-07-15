import fs from 'fs'
import path from 'path'

export default () => 'Hello World'

export function getServerSideProps() {
  try {
    fs.readyFile(path.join(process.cwd(), 'public/small.jpg'))
  } catch (_) {}
  return { props: {} }
}
