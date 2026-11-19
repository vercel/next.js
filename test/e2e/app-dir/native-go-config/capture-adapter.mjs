import fs from 'node:fs/promises'
import path from 'node:path'

export default {
  name: 'native-go-config-capture',
  async onBuildComplete({ projectDir, outputs }) {
    await fs.writeFile(
      path.join(projectDir, 'go-config-output.json'),
      JSON.stringify({
        middleware: outputs.middleware,
        routes: outputs.appRoutes,
      })
    )
  },
}
