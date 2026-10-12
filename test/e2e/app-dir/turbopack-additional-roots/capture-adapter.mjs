import fs from 'fs/promises'
import path from 'path'

/** @type {import('next').NextAdapter} */
const adapter = {
  name: 'capture-additional-roots-adapter',
  async onBuildComplete(context) {
    await fs.writeFile(
      path.join(context.projectDir, 'build-complete.json'),
      JSON.stringify(context)
    )
  },
}

export default adapter
