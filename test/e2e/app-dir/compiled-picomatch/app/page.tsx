const { makeRe } = require('next/dist/compiled/picomatch') as {
  makeRe(pattern: string): RegExp
}

export default function Page() {
  return <p id="regex-source">{makeRe('+(a|aa)').source}</p>
}
