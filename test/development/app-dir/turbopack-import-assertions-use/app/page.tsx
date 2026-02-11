// @ts-nocheck
// Import a .txt file using a raw loader via turbopackLoader
// turbopackAs tells turbopack to treat the loader output as JavaScript
import rawText from '../data.txt' with { turbopackLoader: 'test-raw-loader', turbopackAs: '*.js' }
// Import a .js file with a replace loader via turbopackLoader with options
import replacedValue from '../data-with-placeholder.js' with { turbopackLoader: 'test-replace-loader', turbopackLoaderOptions: '{"search":"PLACEHOLDER","replace":"turbopackUse works!"}' }
// Import a .txt file using turbopackModuleType to treat loader output as ecmascript
import rawTextViaModuleType from '../data2.txt' with { turbopackLoader: '../node_modules/test-raw-loader/index.js', turbopackModuleType: 'ecmascript' }
// Import a non-.json file and treat it as JSON via turbopackModuleType
import jsonData from '../data.jsonlike' with { turbopackLoader: 'test-identity-loader', turbopackModuleType: 'json' }

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
