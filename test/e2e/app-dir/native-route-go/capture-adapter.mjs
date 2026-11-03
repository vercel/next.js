import fs from 'fs/promises'
import path from 'path'

/** @type {import('next').NextAdapter} */
export default {
  name: 'native-route-go-output-capture',
  async onBuildComplete(context) {
    await fs.writeFile(
      path.join(context.projectDir, 'go-adapter-output.json'),
      JSON.stringify(context, null, 2)
    )
  },
}
