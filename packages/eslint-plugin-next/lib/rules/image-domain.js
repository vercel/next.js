const { URL } = require('url')

const { nextImage } = require('../utils/image.js')
const NodeAttributes = require('../utils/nodeAttributes.js')

module.exports = {
  meta: {
    docs: {
      description:
        'Ensure domain or loader is configured for image optimization',
      category: 'HTML',
      recommended: true,
    },
  },
  create: nextImage((context, node) => {
    const [customNextConfigPath] = context.options

    if (node.name.name !== 'Image') {
      return
    }

    let attributes = new NodeAttributes(node)
    let srcValue = attributes.value('src')

    if (!srcValue.startsWith('http')) {
      return
    }

    const imgHost = new URL(srcValue).hostname
    const configFile =
      customNextConfigPath || `${context.getCwd()}/next.config.js`

    let domainConfigured = false
    let loaderConfigured = false

    try {
      let config = require(configFile)
      delete require.cache[require.resolve(configFile)]
      config = require(configFile)

      const { images } = config

      domainConfigured =
        images && images.domains && images.domains.includes(imgHost)
      loaderConfigured = attributes.has('loader') || (images && !!images.loader)
    } catch (err) {
      return
    } finally {
      if (!configFile || (!domainConfigured && !loaderConfigured)) {
        context.report({
          node,
          message: `No domain or loader is specified in next.config.js for ${imgHost}. See https://nextjs.org/docs/messages/image-domain.`,
        })
      }
    }
  }),
}
