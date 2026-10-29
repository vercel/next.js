import { writeFile } from 'fs/promises'
import path from 'path'

/** @type {import('next').NextAdapter} */
const adapter = {
  name: 'adapter-build-mode',
  modifyConfig(config) {
    console.log('adapter-build-mode: modifyConfig')
    return {
      ...config,
      basePath: '/adapter',
      env: {
        ...config.env,
        ADAPTER_BUILD_MODE: 'configured by adapter',
      },
    }
  },
  async onBuildComplete(context) {
    console.log('adapter-build-mode: onBuildComplete')
    await writeFile(
      path.join(context.projectDir, 'build-complete.json'),
      JSON.stringify(context)
    )
  },
}

export default adapter
