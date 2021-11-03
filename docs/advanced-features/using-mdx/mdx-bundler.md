---
description: Learn how to use mdx-bundler in your Next.js project.
---

# `mdx-bundler`

The `mdx-bundler` package does **not** require a global configuration, instead it bundles the dependencies of your MDX files allowing you to directly import components in the MDX file. `mdx-bundler` also supports soucing data from anywhere, including local files, external APIs or databases.

Note that it uses [esbuild](https://esbuild.github.io) under the hood, meaning this will need to be installed as a dependency.

Also note that one of `mdx-bundler`'s dependencies requires a working node-gyp setup to be able to install correctly.

## Setup `mdx-bundler` in Next.js

The following shows how to setup `mdx-bundler` for use with a blog.

1. Install the required packages:

   ```terminal
     npm i mdx-bundler esbuild gray-matter

     #or

     yarn add mdx-bundler esbuild gray-matter
   ```

2. Create an `mdx.js` file. The name is arbitrary and the file can be placed anywhere within your projects file structure. In this file you will setup `mdx-bundler` and create some utility functions that will get your MDX files content, frontmatter, and as a nice touch, provide a previous and next path.

3. The below example assumes you have a directory within `/pages` called `/posts`. Begin by creating a function that will read the file contents from a specified path. In this case, a path to your blog posts:

   ```js
   import fs from 'fs'
   import path from 'path'
   import matter from 'gray-matter'
   import { bundleMDX } from 'mdx-bundler'

   export const ROOT = process.cwd()
   export const POSTS_PATH = path.join(process.cwd(), 'pages/posts')

   export function getFileContent(contentPath, filename) {
     return fs.readFileSync(path.join(contentPath, filename), 'utf8')
   }
   ```

4. Because esbuild relies upon `__dirname` to find the executable file, you have to override the esbuild executable path with an environment variable, otherwise your development builds will fail. To solve this you can set the variable so that it only applies for the duration of the process:

   ```js
   const getCompiledMDX = async (content: string) => {
     if (process.platform === 'win32') {
       process.env.ESBUILD_BINARY_PATH = path.join(
         ROOT,
         'node_modules',
         'esbuild',
         'esbuild.exe'
       )
     } else {
       process.env.ESBUILD_BINARY_PATH = path.join(
         ROOT,
         'node_modules',
         'esbuild',
         'bin',
         'esbuild'
       )
     }
   }
   ```

5. Inside the same `getCompiledMDX` function, return the `bundleMDX` function specifying the `xdmOptions`. These options include adding any remark or rehype plugins you want to use, as well as applying any esbuild configurations:

   ```js
   const getCompiledMDX = async (content: string) => {
     if (process.platform === 'win32') {
       process.env.ESBUILD_BINARY_PATH = path.join(
         ROOT,
         'node_modules',
         'esbuild',
         'esbuild.exe'
       )
     } else {
       process.env.ESBUILD_BINARY_PATH = path.join(
         ROOT,
         'node_modules',
         'esbuild',
         'bin',
         'esbuild'
       )
     }
     // Add your remark and rehype plugins here
     const remarkPlugins = []
     const rehypePlugins = []

     try {
       return await bundleMDX(content, {
         xdmOptions(options) {
           options.remarkPlugins = [
             ...(options.remarkPlugins ?? []),
             ...remarkPlugins,
           ]
           options.rehypePlugins = [
             ...(options.rehypePlugins ?? []),
             ...rehypePlugins,
           ]

           return options
         },
       })
     } catch (error) {
       throw new Error(error)
     }
   }
   ```

6. Create two new utility functions which will be used to get the MDX file content based on its path, and return the content and frontmatter:

   ```js
   export const getSingleArticle = async (contentPath, slug) => {
     // Get the content of the MDX file by its path
     const source = getFileContent(contentPath, `${slug}.mdx`)
     // Using another utility function, get all the post files and calculate any next or previous posts
     const allArticles = getAllArticles(contentPath)
     const articleIndex = allArticles.findIndex(
       (article) => article.slug === slug
     )
     const previousArticle = allArticles[articleIndex - 1]
     const nextArticle = allArticles[articleIndex + 1]
     // Destructure the code (file content) and frontmatter
     const { code, frontmatter } = await getCompiledMDX(source)
     // Return the frontmatter, file content, next and previous slugs if they exist
     return {
       frontmatter,
       code,
       previousArticle: previousArticle || null,
       nextArticle: nextArticle || null,
     }
   }

   export const getAllArticles = (contentPath: string) => {
     return fs
       .readdirSync(POSTS_PATH)
       .filter((path) => /\.mdx?$/.test(path))
       .map((fileName) => {
         const source = getFileContent(contentPath, fileName)
         const slug = fileName.replace(/\.mdx?$/, '')

         const { data } = matter(source)

         return {
           frontmatter: data,
           slug: slug,
         }
       })
   }
   ```

7. These utility functions can now be used to create static pages from your MDX files. Inside your [dynamic route](/docs/routing/dynamic-routes) (`[slug].js`) import that `getSingleArticle` utility function and pass in the path to where your MDX files are, and the slug:

   ```js
   import { getSingleArticle, POSTS_PATH } from 'utlis'

   export const getStaticProps = async ({ params }) => {
     const post = await getSingleArticle(POSTS_PATH, params.slug)
     return {
       props: {
         ...post,
         slug: params.slug,
       },
     }
   }
   ```

8. Finally, inside the same dynamic route file, import the `getMDXComponent` function and pass in the MDX file contents, retrieved and spread in the previous step as `...post` from the components props as `code`. Using Reacts `useMemo` hook create a component which will render the contents of your MDX file.

   ```jsx
   import { getMDXComponent } from 'mdx-bundler/client'
   import { getSingleArticle, POSTS_PATH } from 'utlis'

   export default function Post({ code, frontmatter }) {
     const Component = React.useMemo(() => getMDXComponent(code), [code])

     return (
       <div className="wrapper">
         <h1>{frontmatter.title}</h1>
         <Component />
       </div>
     )
   }

   export const getStaticProps = async ({ params }) => {
     const post = await getSingleArticle(POSTS_PATH, params.slug)
     return {
       props: {
         ...post,
         slug: params.slug,
       },
     }
   }
   ```

## Adding custom components

You can now import a React component directly inside your MDX page. When you want to style your own elements to give a custom feel to your website or application, you can pass in shortcodes. These are your own custom components that map to `HTML` elements. To do this you use the `MDXProvider` and pass a components object as a prop. Each object key in the components object maps to a `HTML` element name.

```jsx
// Other imports
import { Heading, Text, Pre, Code, Table } from 'my-components'

const ResponsiveImage = (props) => (
  <Image alt={props.alt} layout="responsive" {...props} />
)

const components = {
  img: ResponsiveImage,
  h1: Heading.H1,
  h2: Heading.H2,
  p: Text,
  code: Pre,
  inlineCode: Code,
}

export default function Post({ code, frontmatter }) {
  const Component = React.useMemo(() => getMDXComponent(code), [code])

  return (
    <div className="wrapper">
      <h1>{frontmatter.title}</h1>
      <Component components={components} />
    </div>
  )
}

// Data fetching functions...
```
