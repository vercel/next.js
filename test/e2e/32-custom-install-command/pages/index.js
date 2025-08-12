import path from 'path'
import { promises as fs } from 'fs'

export async function getStaticProps(context) {
  console.log(process.cwd())
  const installPath = path.join(process.cwd(), 'install.txt')
  const install = await fs.readFile(installPath, 'utf8')
  return {
    props: { install },
  }
}

export default function ({ install }) {
  return <div>{install}</div>
}
