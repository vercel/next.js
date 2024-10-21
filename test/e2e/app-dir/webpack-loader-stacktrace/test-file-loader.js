function getSource(type) {
  if (type === 'pages') {
    return `
    export default function Page({stack}) {
      return <main>{new Error().stack}</main>
    }
    export const getServerSideProps = async () => {
      return {
        props: {
          stack: new Error().stack,
        }
      }
    }`
  } else if (type === 'app-page') {
    return `
    export default function Page({}) {
      return <main>{new Error().stack}</main>
    }
    `
  } else if (type === 'app-route') {
    return `
    export function GET({}) {
      return new Response(new Error().stack)
    }
    `
  }
}

module.exports = function () {
  const options = this.getOptions()
  const source = getSource(options.type)
  const lines = source.split('\n').length
  const sourceMap = {
    version: 3,
    sources: [`${options.type}-source.txt`],
    sourcesContent: [
      Array.from({ length: lines })
        .map((_, i) => `line ${i + 1}`)
        .join('\n'),
    ],
    mappings: 'AAAA' + ';AACA'.repeat(lines),
  }
  this.callback(null, source, sourceMap)
}
