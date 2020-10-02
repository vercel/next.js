# Bunadmin TypeScript Next.js example

This is a really simple project that shows the usage of Next.js with [Bunadmin](https://github.com/bunred/bunadmin) TypeScript.

## How to use it?

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example bunadmin-typescript
# or
yarn create next-app --example bunadmin-typescript
```

## Notes

Login with any user below

- Username: `admin`, `reviewer`, `user`
- Password: `bunadmin`

If it shows
`React Invalid Hook Call Warning`, please delete yarn.lock and execute `yarn install` again. This problem is still waiting to be resolved.

*temporary command*
```
yarn run "yarn force"
```

Includes a sample plugin: `myblog`

To create a more complete plugin, please refer to:
 
[blog-example Code](https://github.com/bunred/bunadmin/tree/master/plugins/bunadmin-plugin-example-blog)

[blog-example Online Demo](http://blog.eg.bunadmin.com/blog/post)

[blog-example Docs](http://blog.eg.bunadmin.com/docs/getting-started/remote-data)
