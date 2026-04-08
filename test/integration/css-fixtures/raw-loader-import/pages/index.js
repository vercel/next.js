import React from 'react'

// Import CSS with raw-loader - this should return raw source, not processed CSS
const rawCss = require('!!raw-loader!./styles.css')

export default function HomePage() {
  return (
    <div>
      <h1>Raw Loader Test</h1>
      <p>
        This page tests that CSS imported with raw-loader returns raw source
        instead of processed CSS.
      </p>

      <h2>Raw CSS Content:</h2>
      <pre
        style={{
          backgroundColor: '#f5f5f5',
          padding: '10px',
          border: '1px solid #ddd',
          whiteSpace: 'pre-wrap',
          fontSize: '12px',
        }}
      >
        {rawCss}
      </pre>

      <h2>Test Results:</h2>
      <ul>
        <li>
          If the CSS content above shows raw CSS (like{' '}
          <code>
            .test {'{'} color: red; {'}'}
          </code>
          ), the fix is working ✅
        </li>
        <li>
          If the page has a red background (from the CSS being applied), the fix
          is not working ❌
        </li>
      </ul>
    </div>
  )
}
