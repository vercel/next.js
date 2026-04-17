# react-current-version: CONVERSION-BUG

## Summary

The test failure is caused by incorrect runtime configuration in the converted test. The `makeIndexPage` function contains a template string `runtime: '${runtime}'` that is not being properly evaluated, leaving the literal string `${runtime}` instead of the actual runtime value ('experimental-edge' or 'nodejs'). This causes React hook initialization failures and prevents proper dynamic imports and styled-jsx functionality.

## Evidence

1. **Hook initialization errors**: The output shows "Invalid hook call" errors with `useContext` and `useInsertionEffect` returning null, indicating fundamental React runtime issues.

2. **Template string not evaluated**: In the converted test's `makeIndexPage` function, line 29 contains `runtime: '${runtime}'` which should be evaluated to the actual runtime string, but appears to remain as literal text.

3. **Original vs converted approach**: The original integration test used `File.replace()` to modify the index.js file:

   ```javascript
   indexPage.replace("// runtime: 'experimental-edge'", `runtime: '${runtime}'`)
   ```

   While the converted test uses `overrideFiles` with a string template that's not being properly interpolated.

4. **Specific test failures**: Both failing tests depend on runtime-specific behavior:
   - Dynamic imports test fails because `dynamicIds` is undefined (likely due to improper bundling from wrong runtime)
   - Styled-jsx test fails because styles aren't being flushed (runtime-dependent feature)

## Fix suggestion

Replace the `makeIndexPage` function approach with proper template string evaluation:

```javascript
overrideFiles: {
  'pages/index.js': `import ReactDOM from 'react-dom'
import Image from 'next/image'

export default function Index() {
  if (typeof window !== 'undefined') {
    window.didHydrate = true
  }
  console.log('__render__')
  return (
    <div>
      <p id="react-dom-version">{ReactDOM.version}</p>
      <Image
        id="priority-image"
        priority
        src="/noop.png"
        width={300}
        height={400}
      />
    </div>
  )
}

export const config = {
  runtime: '${runtime}'
}
`,
},
```

Or use a function that properly evaluates the template:

```javascript
overrideFiles: {
  'pages/index.js': makeIndexPage(runtime),
},
```

Where `makeIndexPage` should return the actual interpolated string, not a template.
