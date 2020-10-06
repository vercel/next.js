# SSR Custom Fetcher Example

This example shows how to change the fetch behavior when `getServerSideProps` is executed on the client side. When calling `getServerSideProps` from the client side, the status information of the client is sent to the server. On the server side, when `getServerSideProps` is executed, it refers to the value received from the client and sends the value back to the client after calculation.

Each time you move a link in the example page, the count value increases by 1. Even if the client status is changed by clicking the ʻIncrease count`or`Decrase count` button, the server updates the current client's count value plus 1.

## How to use

Implement the `serverSidePropsFetch` function in the page file and export it. See the sample below.

```js
/** pages/index.js */
...
export const getServerSideProps = (...) => {...};
export const serverSidePropsFetcher = async (url, options) => {
  /**
   * This function replaces the `fetch` function that is used internally
   * when moving to the page where `getServerSideProps` is defined.
   * [!] This function only runs in the browser environment.
   * @see https://www.npmjs.com/package/node-fetch
   */
  return fetch(url, {
    ...options,
    method: 'put',
    body: JSON.stringify(window?.__store__ || {}),
    headers: { 'Content-Type': 'application/json' },
  });
}
```
