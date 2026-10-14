const sibling = require('sibling')
const { formatUrl } = require('next/dist/shared/lib/router/utils/format-url')

module.exports = {
  value: `linked-${sibling.value}-${formatUrl({ pathname: '/next-plugin' })}`,
}
