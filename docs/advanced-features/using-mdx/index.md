---
description: Using MDX with your Next.js site.
---

# Using MDX with Next.js

Next.js supports MDX through a number of different means, this page will outline some of the ways you can begin intergrating MDX into your Next.js project.

## What is MDX?

MDX is a superset of markdown that lets you write JSX directly in your markdown files. It is a powerful way to add dynamic interactivity, and embed components within your content, helping you to bring your pages to life.

### MDX plugins

Internally MDX uses remark and rehype. Remark is a markdown processor powered by a plugins ecosystem. This plugin ecosystem lets you parse code, transform `HTML` elements, change syntax, extract frontmatter, and more.

Rehype is an `HTML` processor, also powered by a plugin ecosystem. Similar to remark, these plugins let you manipulate, sanitize, compile and configure all types of data, elements and content.

To use a plugin from either remark or rehype, you will need to add it to the MDX packages config. Each package has a different way to configure its API.

## MDX packages

The following guides show how you can integrate MDX with your Next.js project.

<div class="card">
  <a href="/docs/advanced-features/using-mdx/next-mdx.md">
    <b>@next/mdx</b>
    <small>Learn how to use @next/mdx in Next.js.</small>
  </a>
</div>

<div class="card">
  <a href="/docs/advanced-features/using-mdx/next-mdx-remote.md">
    <b>next-mdx-remote</b>
    <small>Learn how to use next-mdx-remote in Next.js.</small>
  </a>
</div>

<div class="card">
  <a href="/docs/basic-features/typescript.md#pages">
    <b>mdx-bundler</b>
     <small>Learn how to use mdx-bundler in Next.js.</small>
  </a>
</div>

## Helpful links

- [MDX](https://mdxjs.com)
- [remark](https://github.com/remarkjs/remark)
- [rehype](https://github.com/rehypejs/rehype)
