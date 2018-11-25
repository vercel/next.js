// Rewrite imports using next/<something> to next-server/<something>
export default function ({ types: t, template }) {
  return {
    visitor: {
      ImportDeclaration (path) {
        const source = path.node.source.value
        if (source === 'next/asset') {
          path.node.source.value = 'next-server/asset'
        }
        if (source === 'next/dynamic') {
          path.node.source.value = 'next-server/dynamic'
        }
        if (source === 'next/constants') {
          path.node.source.value = 'next-server/constants'
        }
        if (source === 'next/config') {
          path.node.source.value = 'next-server/config'
        }
        if (source === 'next/head') {
          path.node.source.value = 'next-server/head'
        }
        if (source === 'next/link') {
          path.node.source.value = 'next-server/link'
        }
        if (source === 'next/router') {
          path.node.source.value = 'next-server/router'
        }
      }
    }
  }
}
