[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-typescript)
# TypeScript Next.js example  
This is a really simple project that show the usage of Next.js with TypeScript.  

## How to use it?  
```
npm install  # to install dependencies
npm run dev  # to compile TypeScript files and to run next.js  
```  

Output JS files are aside the related TypeScript ones.  

## To fix  
In tsconfig.json the options `jsx="react"` compiles JSX syntax into nested React.createElement calls.  
This solution doesn't work well with some Next.js features like `next/head` or `next/link`.  
The workaround is to create JS files that just return the mentioned module and require them from TSX files.  
Like  

```js
import Link from 'next/link'

export default Link
```
