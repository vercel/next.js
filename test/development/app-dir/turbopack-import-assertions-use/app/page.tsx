// @ts-nocheck
// Import a .txt file using a raw loader via turbopackUse
// turbopackAs tells turbopack to treat the loader output as JavaScript
import rawText from '../data.txt' with { turbopackUse: [
  { loader: 'test-raw-loader' },
], turbopackAs: '*.js' }
// Import a .js file with a replace loader via turbopackUse with options
import replacedValue from '../data-with-placeholder.js' with { turbopackUse: [
  {
    loader: 'test-replace-loader',
    options: { search: 'PLACEHOLDER', replace: 'turbopackUse works!' },
  },
] }
// Import a .txt file using turbopackModuleType to treat loader output as ecmascript
import rawTextViaModuleType from '../data2.txt' with { turbopackUse: [
  { loader: 'test-raw-loader' },
], turbopackModuleType: 'ecmascript' }
// Import a non-.json file and treat it as JSON via turbopackModuleType
import jsonData from '../data.jsonlike' with { turbopackUse: [
  { loader: 'test-identity-loader' },
], turbopackModuleType: 'json' }

export default function Page() {
  return (
    <div>
      <p id="raw">{rawText}</p>
      <p id="replaced">{replacedValue}</p>
      <p id="module-type">{rawTextViaModuleType}</p>
      <p id="json-type">{jsonData.greeting}</p>
    </div>
  )
}
