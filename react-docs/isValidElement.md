---
title: isValidElement
---

<Intro>

`isValidElement` checks whether a value is a React element.

```js
const isElement = isValidElement(value)
```

</Intro>

<InlineToc />

---

## Reference {/_reference_/}

### `isValidElement(value)` {/_isvalidelement_/}

Call `isValidElement(value)` to check whether `value` is a React element.

```js
import { isValidElement, createElement } from 'react'

// ✅ React elements
console.log(isValidElement(<p />)) // true
console.log(isValidElement(createElement('p'))) // true

// ❌ Not React elements
console.log(isValidElement(25)) // false
console.log(isValidElement('Hello')) // false
console.log(isValidElement({ age: 42 })) // false
```

[See more examples below.](#usage)

#### Parameters {/_parameters_/}

- `value`: The `value` you want to check. It can be any a value of any type.

#### Returns {/_returns_/}

`isValidElement` returns `true` if the `value` is a React element. Otherwise, it returns `false`.

#### Caveats {/_caveats_/}

- **Only [JSX tags](/learn/writing-markup-with-jsx) and objects returned by [`createElement`](/reference/react/createElement) are considered to be React elements.** For example, even though a number like `42` is a valid React _node_ (and can be returned from a component), it is not a valid React element. Arrays and portals created with [`createPortal`](/reference/react-dom/createPortal) are also _not_ considered to be React elements.

---

## Usage {/_usage_/}

### Checking if something is a React element {/_checking-if-something-is-a-react-element_/}

Call `isValidElement` to check if some value is a _React element._

React elements are:

- Values produced by writing a [JSX tag](/learn/writing-markup-with-jsx)
- Values produced by calling [`createElement`](/reference/react/createElement)

For React elements, `isValidElement` returns `true`:

```js
import { isValidElement, createElement } from 'react'

// ✅ JSX tags are React elements
console.log(isValidElement(<p />)) // true
console.log(isValidElement(<MyComponent />)) // true

// ✅ Values returned by createElement are React elements
console.log(isValidElement(createElement('p'))) // true
console.log(isValidElement(createElement(MyComponent))) // true
```

Any other values, such as strings, numbers, or arbitrary objects and arrays, are not React elements.

For them, `isValidElement` returns `false`:

```js
// ❌ These are *not* React elements
console.log(isValidElement(null)) // false
console.log(isValidElement(25)) // false
console.log(isValidElement('Hello')) // false
console.log(isValidElement({ age: 42 })) // false
console.log(isValidElement([<div />, <div />])) // false
console.log(isValidElement(MyComponent)) // false
```

It is very uncommon to need `isValidElement`. It's mostly useful if you're calling another API that _only_ accepts elements (like [`cloneElement`](/reference/react/cloneElement) does) and you want to avoid an error when your argument is not a React element.

Unless you have some very specific reason to add an `isValidElement` check, you probably don't need it.

<DeepDive>

#### React elements vs React nodes {/_react-elements-vs-react-nodes_/}

When you write a component, you can return any kind of _React node_ from it:

```js
function MyComponent() {
  // ... you can return any React node ...
}
```

A React node can be:

- A React element created like `<div />` or `createElement('div')`
- A portal created with [`createPortal`](/reference/react-dom/createPortal)
- A string
- A number
- `true`, `false`, `null`, or `undefined` (which are not displayed)
- An array of other React nodes

**Note `isValidElement` checks whether the argument is a _React element,_ not whether it's a React node.** For example, `42` is not a valid React element. However, it is a perfectly valid React node:

```js
function MyComponent() {
  return 42 // It's ok to return a number from component
}
```

This is why you shouldn't use `isValidElement` as a way to check whether something can be rendered.

</DeepDive>
