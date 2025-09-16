import fs from 'fs'

// @ts-check
/** @type {import('next').NextAdapter } */
const myAdapter = {
  name: 'my-custom-adapter',
  modifyConfig: (config, { phase }) => {
    if (typeof phase !== 'string') {
      throw new Error(`invalid phase value provided to modifyConfig ${phase}`)
    }
    console.log('called modify config in adapter with phase', phase)
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
