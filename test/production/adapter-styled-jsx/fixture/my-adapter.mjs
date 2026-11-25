import fs from 'fs'

// @ts-check
/** @type {import('next').NextAdapter } */
const myAdapter = {
  name: 'my-styled-jsx-adapter',
  onBuildComplete: async (ctx) => {
    await fs.promises.writeFile(
      'build-complete.json',
      JSON.stringify(ctx, null, 2)
    )
  },
}

export default myAdapter
