const { getHighlighter } = require('shiki')

async function main() {
  const { codeToThemedTokens } = await getHighlighter({
    theme: 'nord',
    langs: ['javascript'],
  })
  const result = codeToThemedTokens('let n=1', 'javascript')
  Array.isArray(result)
}

main()
