const END_OF_OPERATION = process.argv[2]

import Component, * as otherExports from '.'
import { renderToString, renderToStaticMarkup } from 'react-dom/server'
;('TURBOPACK { transition: next-client }')
import chunkGroup from '.'

process.stdout.write('READY\n')

const NEW_LINE = '\n'.charCodeAt(0)
let buffer = []
process.stdin.on('data', async (data) => {
  let idx = data.indexOf(NEW_LINE)
  while (idx >= 0) {
    buffer.push(data.slice(0, idx))
    try {
      let json = JSON.parse(Buffer.concat(buffer).toString('utf-8'))
      let result = await operation(json)
      console.log(`RESULT=${JSON.stringify(result)}`)
    } catch (e) {
      console.log(`ERROR=${JSON.stringify(e.stack)}`)
    }
    console.log(END_OF_OPERATION)
    data = data.slice(idx + 1)
    idx = data.indexOf(NEW_LINE)
  }
  buffer.push(data)
})

async function operation(data) {
  let staticProps = data
  if ('getStaticProps' in otherExports) {
    // TODO(alexkirsz) Pass in `context` as defined in
    // https://nextjs.org/docs/api-reference/data-fetching/get-static-props#context-parameter
    staticProps = otherExports.getStaticProps({})
    if ('then' in staticProps) {
      staticProps = await staticProps
    }
  }

  // TODO capture meta info during rendering
  const rendered = {
    __html: renderToString(<Component {...staticProps.props} />),
  }
  const urls = chunkGroup.map((p) => `/${p}`)
  const scripts = urls.filter((url) => url.endsWith('.js'))
  const styles = urls.filter((url) => url.endsWith('.css'))
  return renderToStaticMarkup(
    <html>
      <head>
        {styles.map((url) => (
          <link key={url} href={url} type="text/css" />
        ))}
        {scripts.map((url) => (
          <link key={url} type="preload" href={url} as="script" />
        ))}
      </head>
      <body>
        <script
          id="__NEXT_DATA__"
          type="application/json"
          dangerouslySetInnerHTML={{
            __html: htmlEscapeJsonString(JSON.stringify(staticProps)),
          }}
        ></script>
        <div id="__next" dangerouslySetInnerHTML={rendered}></div>
        {scripts.map((url) => (
          <script key={url} src={url} type="text/javascript"></script>
        ))}
      </body>
    </html>,
  )
}

// This utility is based on https://github.com/zertosh/htmlescape
// License: https://github.com/zertosh/htmlescape/blob/0527ca7156a524d256101bb310a9f970f63078ad/LICENSE

const ESCAPE_LOOKUP = {
  '&': '\\u0026',
  '>': '\\u003e',
  '<': '\\u003c',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
}

const ESCAPE_REGEX = /[&><\u2028\u2029]/g

export function htmlEscapeJsonString(str) {
  return str.replace(ESCAPE_REGEX, (match) => ESCAPE_LOOKUP[match])
}
