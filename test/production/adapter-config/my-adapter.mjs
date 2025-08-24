import fs from 'fs'

// @ts-check
/** @type {import('next').NextAdapter } */
const myAdapter = {
  name: 'my-custom-adapter',
  modifyConfig: (config) => {
    console.log('called modify config in adapter')
    config.basePath = '/docs'
    return config
  },
  onBuildComplete: async (ctx) => {
    console.log('onBuildComplete called')

    await fs.promises.writeFile(
      'build-complete.json',
      JSON.stringify(ctx, null, 2)
    )
  },
}

export default myAdapter
