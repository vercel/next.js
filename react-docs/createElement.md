---
title: createElement
---

<Intro>

`createElement` lets you create a React element. It serves as an alternative to writing [JSX.](/learn/writing-markup-with-jsx)

```js
const element = createElement(type, props, ...children)
```

</Intro>

<InlineToc />

---

## Reference {/_reference_/}

### `createElement(type, props, ...children)` {/_createelement_/}

Call `createElement` to create a React element with the given `type`, `props`, and `children`.

```js
import { createElement } from 'react'

function Greeting({ name }) {
  return createElement('h1', { className: 'greeting' }, 'Hello')
}
```

[See more examples below.](#usage)

#### Parameters {/_parameters_/}

- `type`: The `type` argument must be a valid React component type. For example, it could be a tag name string (such as `'div'` or `'span'`), or a React component (a function, a class, or a special component like [`Fragment`](/reference/react/Fragment)).

- `props`: The `props` argument must either be an object or `null`. If you pass `null`, it will be treated the same as an empty object. React will create an element with props matching the `props` you have passed. Note that `ref` and `key` from your `props` object are special and will _not_ be available as `element.props.ref` and `element.props.key` on the returned `element`. They will be available as `element.ref` and `element.key`.

- **optional** `...children`: Zero or more child nodes. They can be any React nodes, including React elements, strings, numbers, [portals](/reference/react-dom/createPortal), empty nodes (`null`, `undefined`, `true`, and `false`), and arrays of React nodes.

#### Returns {/_returns_/}

`createElement` returns a React element object with a few properties:

- `type`: The `type` you have passed.
- `props`: The `props` you have passed except for `ref` and `key`.
- `ref`: The `ref` you have passed. If missing, `null`.
- `key`: The `key` you have passed, coerced to a string. If missing, `null`.

Usually, you'll return the element from your component or make it a child of another element. Although you may read the element's properties, it's best to treat every element as opaque after it's created, and only render it.

#### Caveats {/_caveats_/}

- You must **treat React elements and their props as [immutable](https://en.wikipedia.org/wiki/Immutable_object)** and never change their contents after creation. In development, React will [freeze](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/freeze) the returned element and its `props` property shallowly to enforce this.

- When you use JSX, **you must start a tag with a capital letter to render your own custom component.** In other words, `<Something />` is equivalent to `createElement(Something)`, but `<something />` (lowercase) is equivalent to `createElement('something')` (note it's a string, so it will be treated as a built-in HTML tag).

- You should only **pass children as multiple arguments to `createElement` if they are all statically known,** like `createElement('h1', {}, child1, child2, child3)`. If your children are dynamic, pass the entire array as the third argument: `createElement('ul', {}, listItems)`. This ensures that React will [warn you about missing `key`s](/learn/rendering-lists#keeping-list-items-in-order-with-key) for any dynamic lists. For static lists this is not necessary because they never reorder.

---

## Usage {/_usage_/}

### Creating an element without JSX {/_creating-an-element-without-jsx_/}

If you don't like [JSX](/learn/writing-markup-with-jsx) or can't use it in your project, you can use `createElement` as an alternative.

To create an element without JSX, call `createElement` with some <CodeStep step={1}>type</CodeStep>, <CodeStep step={2}>props</CodeStep>, and <CodeStep step={3}>children</CodeStep>:

```js [[1, 5, "'h1'"], [2, 6, "{ className: 'greeting' }"], [3, 7, "'Hello ',"], [3, 8, "createElement('i', null, name),"], [3, 9, "'. Welcome!'"]]
import { createElement } from 'react'

function Greeting({ name }) {
  return createElement(
    'h1',
    { className: 'greeting' },
    'Hello ',
    createElement('i', null, name),
    '. Welcome!'
  )
}
```

The <CodeStep step={3}>children</CodeStep> are optional, and you can pass as many as you need (the example above has three children). This code will display a `<h1>` header with a greeting. For comparison, here is the same example rewritten with JSX:

```js [[1, 3, "h1"], [2, 3, "className="greeting""], [3, 4, "Hello <i>{name}</i>. Welcome!"], [1, 5, "h1"]]
function Greeting({ name }) {
  return (
    <h1 className="greeting">
      Hello <i>{name}</i>. Welcome!
    </h1>
  )
}
```

To render your own React component, pass a function like `Greeting` as the <CodeStep step={1}>type</CodeStep> instead of a string like `'h1'`:

```js [[1, 2, "Greeting"], [2, 2, "{ name: 'Taylor' }"]]
export default function App() {
  return createElement(Greeting, { name: 'Taylor' })
}
```

With JSX, it would look like this:

```js [[1, 2, "Greeting"], [2, 2, "name="Taylor""]]
export default function App() {
  return <Greeting name="Taylor" />
}
```

Here is a complete example written with `createElement`:

<Sandpack>

```js
import { createElement } from 'react'

function Greeting({ name }) {
  return createElement(
    'h1',
    { className: 'greeting' },
    'Hello ',
    createElement('i', null, name),
    '. Welcome!'
  )
}

export default function App() {
  return createElement(Greeting, { name: 'Taylor' })
}
```

```css
.greeting {
  color: darkgreen;
  font-family: Georgia;
}
```

</Sandpack>

And here is the same example written using JSX:

<Sandpack>

```js
function Greeting({ name }) {
  return (
    <h1 className="greeting">
      Hello <i>{name}</i>. Welcome!
    </h1>
  )
}

export default function App() {
  return <Greeting name="Taylor" />
}
```

```css
.greeting {
  color: darkgreen;
  font-family: Georgia;
}
```

</Sandpack>

Both coding styles are fine, so you can use whichever one you prefer for your project. The main benefit of using JSX compared to `createElement` is that it's easy to see which closing tag corresponds to which opening tag.

<DeepDive>

#### What is a React element, exactly? {/_what-is-a-react-element-exactly_/}

An element is a lightweight description of a piece of the user interface. For example, both `<Greeting name="Taylor" />` and `createElement(Greeting, { name: 'Taylor' })` produce an object like this:

```js
// Slightly simplified
{
  type: Greeting,
  props: {
    name: 'Taylor'
  },
  key: null,
  ref: null,
}
```

**Note that creating this object does not render the `Greeting` component or create any DOM elements.**

A React element is more like a description--an instruction for React to later render the `Greeting` component. By returning this object from your `App` component, you tell React what to do next.

Creating elements is extremely cheap so you don't need to try to optimize or avoid it.

</DeepDive>
