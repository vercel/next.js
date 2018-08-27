# getInitialProps was defined as an instance method

#### Why This Error Occurred

`getInitialProps` must be a static method in order to be called by next.js.

#### Possible Ways to Fix It

Use the static keyword.

```js
export default class YourEntryComponent extends React.Component {
  static getInitialProps () {
    return {}
  }

  render () {
    return 'foo'
  }
}
```

or

```js
const YourEntryComponent = function () {
  return 'foo'
}

YourEntryComponent.getInitialProps = () => {
  return {}
}

export default YourEntryComponent
```

### Useful Links

- [Fetching data and component lifecycle](https://github.com/zeit/next.js#fetching-data-and-component-lifecycle)
