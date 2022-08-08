# Invalid getServerSideProps Return Value

#### Why This Error Occurred

In one of the page's `getServerSideProps` the return value had the incorrect shape.

#### Possible Ways to Fix It

Make sure to return the following shape from `getServerSideProps`:

```ts
export async function getServerSideProps(ctx: GetServerSidePropsContext) {
  return {
    props: { [key: string]: any }
  }
}
```

### Useful Links

- [getServerSideProps](https://nextjs.org/docs/api-reference/data-fetching/get-server-side-props)
