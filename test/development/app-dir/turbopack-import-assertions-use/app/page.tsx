// @ts-nocheck
// Import a .txt file using a raw loader via turbopackUse
// turbopackAs tells turbopack to treat the loader output as JavaScript
import rawText from '../data.txt' with {
  turbopackUse: [{ loader: 'test-raw-loader' }],
  turbopackAs: '*.js',
}
// Import a .js file with a replace loader via turbopackUse with options
import replacedValue from '../data-with-placeholder.js' with {
  turbopackUse: [
    {
      loader: 'test-replace-loader',
      options: { search: 'PLACEHOLDER', replace: 'turbopackUse works!' },
    },
  ],
}

export default function Page() {
  return (
    <div>
      <p id="raw">{rawText}</p>
      <p id="replaced">{replacedValue}</p>
    </div>
  )
}
