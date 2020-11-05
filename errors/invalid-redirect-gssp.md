# Invalid Redirect getStaticProps/getServerSideProps

#### Why This Error Occurred

The `redirect` value returned from your `getStaticProps` or `getServerSideProps` function had invalid values.

#### Possible Ways to Fix It

Make sure you return the proper values for the `redirect` value.

```js
export const getStaticProps = ({ params }) => {
  if (params.slug === 'deleted-post') {
    return {
      redirect: {
        permanent: true, // or false
        destination: '/some-location',
      },
    }
  }

  return {
    props: {
      // data
    },
  }
}
```

### Useful Links

- [Data Fetching Documentation](https://nextjs.org/docs/basic-features/data-fetching#getstaticprops-static-generation)
