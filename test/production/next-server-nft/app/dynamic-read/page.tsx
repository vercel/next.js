import fs from 'fs'
import path from 'path'

export default async function Page() {
  let config = 'file from .next not found'
  try {
    const rootConfig = fs.readFileSync(
      path.join(__dirname, '../../', '.next', globalThis.afile),
      'utf-8'
    )
    config = `Config loaded: ${rootConfig.substring(0, 50)}...`
  } catch (error) {
    config = `File from next not found (this is expected in test)`
  }

  return (
    <div>
      <h1>Dynamic File Read Test</h1>
      <p>This page uses dynamic fs.readFileSync that trace into odd places</p>
      <p>{config}</p>
    </div>
  )
}
