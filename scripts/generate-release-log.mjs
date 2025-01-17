import fetch from 'node-fetch'

async function main() {
  const releasesArray = await fetch(
    'https://api.github.com/repos/vercel/next.js/releases?per_page=100'
  ).then((r) => r.json())

  const allReleases = releasesArray
    .map(({ id, tag_name, created_at, body }) => ({
      id,
      tag_name,
      created_at,
      body: body
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map((e) => e.trim()),
    }))
    .sort((a, b) => a.created_at.localeCompare(b.created_at))

  // targetVersion format is `13.4.15-`, generating changes for all 13.4.15-* canary releases
  const targetVersion = /v(.*?-)/
    .exec(allReleases.filter((e) => /v.*?-/.exec(e.tag_name)).pop().tag_name)
    .pop()

  const releases = allReleases.filter((v) => v.tag_name.includes(targetVersion))

  const lineItems = {
    '### Core Changes': [],
    '### Minor Changes': [],
    '### Documentation Changes': [],
    '### Example Changes': [],
    '### Misc Changes': [],
    '### Patches': [],
    '### Credits': [],
  }

  Object.keys(lineItems).forEach((header) => {
    releases.forEach((release) => {
      const headerIndex = release.body.indexOf(header)

      if (!~headerIndex) return

      let headerLastIndex = release.body
        .slice(headerIndex + 1)
        .findIndex((v) => v.startsWith('###'))

      if (~headerLastIndex) {
        headerLastIndex = headerLastIndex + headerIndex
      } else {
        headerLastIndex = release.body.length - 1
      }

      if (header === '### Credits') {
        release.body.slice(headerIndex, headerLastIndex + 1).forEach((e) => {
          const re = /@[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}/gi
          let m

          do {
            m = re.exec(e)

            if (m) {
              lineItems[header].push(m.pop())
            }
          } while (m)
        })
      } else {
        release.body.slice(headerIndex, headerLastIndex + 1).forEach((e) => {
          if (!e.startsWith('-')) {
            return
          }
          lineItems[header].push(e)
        })
      }
    })
  })

  let finalMessage = []

  Object.keys(lineItems).forEach((header) => {
    let items = lineItems[header]

    if (!items.length) {
      return
    }
    finalMessage.push(header)
    finalMessage.push('')

    if (header === '### Credits') {
      items = [...new Set(items)]
      let creditsMessage = `Huge thanks to `

      if (items.length > 1) {
        creditsMessage += items.slice(0, items.length - 1).join(`, `)
        creditsMessage += `, and `
      }
      creditsMessage += items[items.length - 1]
      creditsMessage += ` for helping!`

      finalMessage.push(creditsMessage)
    } else {
      items.forEach((e) => finalMessage.push(e))
    }

    finalMessage.push('')
  })

  return {
    version: targetVersion.slice(0, -1),
    firstVersion: releases[0].tag_name,
    lastVersion: releases[releases.length - 1].tag_name,
    content: finalMessage.join('\n'),
  }
}

main().then((result) => {
  console.log(result.content)
})
