import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export default {
  name: 'native-proxy-security',
  async onBuildComplete({ projectDir, outputs }) {
    await writeFile(
      join(projectDir, 'security-outputs.json'),
      JSON.stringify({
        distDir: join(projectDir, '.next'),
        middleware: outputs.middleware,
        prerenders: outputs.prerenders,
        staticFiles: outputs.staticFiles,
        appRoutes: outputs.appRoutes,
      })
    )
  },
}
