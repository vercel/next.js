import fs from 'fs'

// @ts-check
/** @type {import('next').NextAdapter } */
const myAdapter = {
  name: 'my-custom-adapter',
  onBuildComplete: async (ctx) => {
    await fs.promises.writeFile(
      'build-complete.json',
      JSON.stringify(ctx, null, 2)
    )
  },
}

export default myAdapter
