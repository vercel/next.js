import markdown from 'markdown-in-js'

// For more advanced use cases see https://github.com/threepointone/markdown-in-js

export default () => <div>{markdown`
## This is a title

This is a paragraph
`}</div>
