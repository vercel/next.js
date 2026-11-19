import fs from 'node:fs/promises'
import path from 'node:path'

export default {
  name: 'native-go-proxy-capture',
  async onBuildComplete({ projectDir, outputs }) {
    await fs.writeFile(
      path.join(projectDir, 'go-proxy-output.json'),
      JSON.stringify(outputs.middleware)
    )
    await fs.writeFile(
      path.join(projectDir, 'go-app-pages-output.json'),
      JSON.stringify(
        outputs.appPages.map(({ id, pathname }) => ({ id, pathname }))
      )
    )
  },
}
