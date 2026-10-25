import fs from 'fs/promises'

/** @type {import('next').NextAdapter} */
export default {
  name: 'route-table-probe',
  async onBuildComplete(ctx) {
    await fs.writeFile(
      'build-complete.json',
      JSON.stringify(ctx.routing, null, 2)
    )
  },
}
