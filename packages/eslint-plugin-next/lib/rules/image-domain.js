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
    fixable: 'code',
  },
  create: nextImage((context, node) => {
    if (node.name.name !== 'Image') {
      return
    }

    let attributes = new NodeAttributes(node)
    let srcValue = attributes.value('src')

    if (!srcValue.startsWith('http')) {
      return
    }

    try {
      const configFile = `${process.cwd()}/next.config.js`
      let config = require(configFile)
      delete require.cache[require.resolve(configFile)]
      config = require(configFile)

      const { images } = config
      const imgHost = new URL(srcValue).hostname

      const domainConfigured =
        images && images.domains && images.domains.includes(imgHost)
      const loaderConfigured =
        attributes.has('loader') || (images && !!images.loader)

      if (!domainConfigured && !loaderConfigured) {
        context.report({
          node,
          message: `No domain is specified in next.config.js for ${imgHost}. See https://nextjs.org/docs/messages/image-domain.`,
        })
      }
    } catch (err) {
      console.log(err)
      return
    }
  }),
}
