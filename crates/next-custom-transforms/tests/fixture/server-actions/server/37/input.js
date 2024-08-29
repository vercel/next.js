export const config = await getConfig()

async function getConfig() {
  'use cache'
}

// ==>

const getConfig = $cache(async function () {
  'use cache'
})

registerServerReference('', getConfig)

export const config = await getConfig()
