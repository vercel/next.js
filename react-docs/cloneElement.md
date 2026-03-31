---
title: cloneElement
---

<Pitfall>

Using `cloneElement` is uncommon and can lead to fragile code. [See common alternatives.](#alternatives)

</Pitfall>

<Intro>

`cloneElement` lets you create a new React element using another element as a starting point.

```js
const clonedElement = cloneElement(element, props, ...children)
```

</Intro>

<InlineToc />

---

## Reference {/_reference_/}

### `cloneElement(element, props, ...children)` {/_cloneelement_/}

Call `cloneElement` to create a React element based on the `element`, but with different `props` and `children`:

```js
import { cloneElement } from 'react'

// ...
const clonedElement = cloneElement(
  <Row title="Cabbage">Hello</Row>,
  { isHighlighted: true },
  'Goodbye'
)

console.log(clonedElement) // <Row title="Cabbage" isHighlighted={true}>Goodbye</Row>
```

[See more examples below.](#usage)

#### Parameters {/_parameters_/}

- `element`: The `element` argument must be a valid React element. For example, it could be a JSX node like `<Something />`, the result of calling [`createElement`](/reference/react/createElement), or the result of another `cloneElement` call.

- `props`: The `props` argument must either be an object or `null`. If you pass `null`, the cloned element will retain all of the original `element.props`. Otherwise, for every prop in the `props` object, the returned element will "prefer" the value from `props` over the value from `element.props`. The rest of the props will be filled from the original `element.props`. If you pass `props.key` or `props.ref`, they will replace the original ones.

- **optional** `...children`: Zero or more child nodes. They can be any React nodes, including React elements, strings, numbers, [portals](/reference/react-dom/createPortal), empty nodes (`null`, `undefined`, `true`, and `false`), and arrays of React nodes. If you don't pass any `...children` arguments, the original `element.props.children` will be preserved.

#### Returns {/_returns_/}

`cloneElement` returns a React element object with a few properties:

- `type`: Same as `element.type`.
- `props`: The result of shallowly merging `element.props` with the overriding `props` you have passed.
- `ref`: The original `element.ref`, unless it was overridden by `props.ref`.
- `key`: The original `element.key`, unless it was overridden by `props.key`.

Usually, you'll return the element from your component or make it a child of another element. Although you may read the element's properties, it's best to treat every element as opaque after it's created, and only render it.

#### Caveats {/_caveats_/}

- Cloning an element **does not modify the original element.**

- You should only **pass children as multiple arguments to `cloneElement` if they are all statically known,** like `cloneElement(element, null, child1, child2, child3)`. If your children are dynamic, pass the entire array as the third argument: `cloneElement(element, null, listItems)`. This ensures that React will [warn you about missing `key`s](/learn/rendering-lists#keeping-list-items-in-order-with-key) for any dynamic lists. For static lists this is not necessary because they never reorder.

- `cloneElement` makes it harder to trace the data flow, so **try the [alternatives](#alternatives) instead.**

---

## Usage {/_usage_/}

### Overriding props of an element {/_overriding-props-of-an-element_/}

To override the props of some <CodeStep step={1}>React element</CodeStep>, pass it to `cloneElement` with the <CodeStep step={2}>props you want to override</CodeStep>:

```js [[1, 5, "<Row title="Cabbage" />"], [2, 6, "{ isHighlighted: true }"], [3, 4, "clonedElement"]]
import { cloneElement } from 'react'

// ...
const clonedElement = cloneElement(<Row title="Cabbage" />, {
  isHighlighted: true,
})
```

Here, the resulting <CodeStep step={3}>cloned element</CodeStep> will be `<Row title="Cabbage" isHighlighted={true} />`.

**Let's walk through an example to see when it's useful.**

Imagine a `List` component that renders its [`children`](/learn/passing-props-to-a-component#passing-jsx-as-children) as a list of selectable rows with a "Next" button that changes which row is selected. The `List` component needs to render the selected `Row` differently, so it clones every `<Row>` child that it has received, and adds an extra `isHighlighted: true` or `isHighlighted: false` prop:

```js {6-8}
export default function List({ children }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  return (
    <div className="List">
      {Children.map(children, (child, index) =>
        cloneElement(child, {
          isHighlighted: index === selectedIndex
        })
      )}
```

Let's say the original JSX received by `List` looks like this:

```js {2-4}
<List>
  <Row title="Cabbage" />
  <Row title="Garlic" />
  <Row title="Apple" />
</List>
```

By cloning its children, the `List` can pass extra information to every `Row` inside. The result looks like this:

```js {4,8,12}
<List>
  <Row title="Cabbage" isHighlighted={true} />
  <Row title="Garlic" isHighlighted={false} />
  <Row title="Apple" isHighlighted={false} />
</List>
```

Notice how pressing "Next" updates the state of the `List`, and highlights a different row:

<Sandpack>

```js
import List from './List.js'
import Row from './Row.js'
import { products } from './data.js'

export default function App() {
  return (
    <List>
      {products.map((product) => (
        <Row key={product.id} title={product.title} />
      ))}
    </List>
  )
}
```

```js src/List.js active
import { Children, cloneElement, useState } from 'react'

export default function List({ children }) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  return (
    <div className="List">
      {Children.map(children, (child, index) =>
        cloneElement(child, {
          isHighlighted: index === selectedIndex,
        })
      )}
      <hr />
      <button
        onClick={() => {
          setSelectedIndex((i) => (i + 1) % Children.count(children))
        }}
      >
        Next
      </button>
    </div>
  )
}
```

```js src/Row.js
export default function Row({ title, isHighlighted }) {
  return (
    <div className={['Row', isHighlighted ? 'RowHighlighted' : ''].join(' ')}>
      {title}
    </div>
  )
}
```

```js src/data.js
export const products = [
  { title: 'Cabbage', id: 1 },
  { title: 'Garlic', id: 2 },
  { title: 'Apple', id: 3 },
]
```

```css
.List {
  display: flex;
  flex-direction: column;
  border: 2px solid grey;
  padding: 5px;
}

.Row {
  border: 2px dashed black;
  padding: 5px;
  margin: 5px;
}

.RowHighlighted {
  background: #ffa;
}

button {
  height: 40px;
  font-size: 20px;
}
```

</Sandpack>

To summarize, the `List` cloned the `<Row />` elements it received and added an extra prop to them.

<Pitfall>

Cloning children makes it hard to tell how the data flows through your app. Try one of the [alternatives.](#alternatives)

</Pitfall>

---

## Alternatives {/_alternatives_/}

### Passing data with a render prop {/_passing-data-with-a-render-prop_/}

Instead of using `cloneElement`, consider accepting a _render prop_ like `renderItem`. Here, `List` receives `renderItem` as a prop. `List` calls `renderItem` for every item and passes `isHighlighted` as an argument:

```js {1,7}
export default function List({ items, renderItem }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  return (
    <div className="List">
      {items.map((item, index) => {
        const isHighlighted = index === selectedIndex;
        return renderItem(item, isHighlighted);
      })}
```

The `renderItem` prop is called a "render prop" because it's a prop that specifies how to render something. For example, you can pass a `renderItem` implementation that renders a `<Row>` with the given `isHighlighted` value:

```js {3,7}
<List
  items={products}
  renderItem={(product, isHighlighted) => (
    <Row key={product.id} title={product.title} isHighlighted={isHighlighted} />
  )}
/>
```

The end result is the same as with `cloneElement`:

```js {4,8,12}
<List>
  <Row title="Cabbage" isHighlighted={true} />
  <Row title="Garlic" isHighlighted={false} />
  <Row title="Apple" isHighlighted={false} />
</List>
```

However, you can clearly trace where the `isHighlighted` value is coming from.

<Sandpack>

```js
import List from './List.js'
import Row from './Row.js'
import { products } from './data.js'

export default function App() {
  return (
    <List
      items={products}
      renderItem={(product, isHighlighted) => (
        <Row
          key={product.id}
          title={product.title}
          isHighlighted={isHighlighted}
        />
      )}
    />
  )
}
```

```js src/List.js active
import { useState } from 'react'

export default function List({ items, renderItem }) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  return (
    <div className="List">
      {items.map((item, index) => {
        const isHighlighted = index === selectedIndex
        return renderItem(item, isHighlighted)
      })}
      <hr />
      <button
        onClick={() => {
          setSelectedIndex((i) => (i + 1) % items.length)
        }}
      >
        Next
      </button>
    </div>
  )
}
```

```js src/Row.js
export default function Row({ title, isHighlighted }) {
  return (
    <div className={['Row', isHighlighted ? 'RowHighlighted' : ''].join(' ')}>
      {title}
    </div>
  )
}
```

```js src/data.js
export const products = [
  { title: 'Cabbage', id: 1 },
  { title: 'Garlic', id: 2 },
  { title: 'Apple', id: 3 },
]
```

```css
.List {
  display: flex;
  flex-direction: column;
  border: 2px solid grey;
  padding: 5px;
}

.Row {
  border: 2px dashed black;
  padding: 5px;
  margin: 5px;
}

.RowHighlighted {
  background: #ffa;
}

button {
  height: 40px;
  font-size: 20px;
}
```

</Sandpack>

This pattern is preferred to `cloneElement` because it is more explicit.

---

### Passing data through context {/_passing-data-through-context_/}

Another alternative to `cloneElement` is to [pass data through context.](/learn/passing-data-deeply-with-context)

For example, you can call [`createContext`](/reference/react/createContext) to define a `HighlightContext`:

```js
export const HighlightContext = createContext(false)
```

Your `List` component can wrap every item it renders into a `HighlightContext` provider:

```js {8,10}
export default function List({ items, renderItem }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  return (
    <div className="List">
      {items.map((item, index) => {
        const isHighlighted = index === selectedIndex;
        return (
          <HighlightContext key={item.id} value={isHighlighted}>
            {renderItem(item)}
          </HighlightContext>
        );
      })}
```

With this approach, `Row` does not need to receive an `isHighlighted` prop at all. Instead, it reads the context:

```js src/Row.js {2}
export default function Row({ title }) {
  const isHighlighted = useContext(HighlightContext);
  // ...
```

This allows the calling component to not know or worry about passing `isHighlighted` to `<Row>`:

```js {4}
<List
  items={products}
  renderItem={(product) => <Row title={product.title} />}
/>
```

Instead, `List` and `Row` coordinate the highlighting logic through context.

<Sandpack>

```js
import List from './List.js'
import Row from './Row.js'
import { products } from './data.js'

export default function App() {
  return (
    <List
      items={products}
      renderItem={(product) => <Row title={product.title} />}
    />
  )
}
```

```js src/List.js active
import { useState } from 'react'
import { HighlightContext } from './HighlightContext.js'

export default function List({ items, renderItem }) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  return (
    <div className="List">
      {items.map((item, index) => {
        const isHighlighted = index === selectedIndex
        return (
          <HighlightContext key={item.id} value={isHighlighted}>
            {renderItem(item)}
          </HighlightContext>
        )
      })}
      <hr />
      <button
        onClick={() => {
          setSelectedIndex((i) => (i + 1) % items.length)
        }}
      >
        Next
      </button>
    </div>
  )
}
```

```js src/Row.js
import { useContext } from 'react'
import { HighlightContext } from './HighlightContext.js'

export default function Row({ title }) {
  const isHighlighted = useContext(HighlightContext)
  return (
    <div className={['Row', isHighlighted ? 'RowHighlighted' : ''].join(' ')}>
      {title}
    </div>
  )
}
```

```js src/HighlightContext.js
import { createContext } from 'react'

export const HighlightContext = createContext(false)
```

```js src/data.js
export const products = [
  { title: 'Cabbage', id: 1 },
  { title: 'Garlic', id: 2 },
  { title: 'Apple', id: 3 },
]
```

```css
.List {
  display: flex;
  flex-direction: column;
  border: 2px solid grey;
  padding: 5px;
}

.Row {
  border: 2px dashed black;
  padding: 5px;
  margin: 5px;
}

.RowHighlighted {
  background: #ffa;
}

button {
  height: 40px;
  font-size: 20px;
}
```

</Sandpack>

[Learn more about passing data through context.](/reference/react/useContext#passing-data-deeply-into-the-tree)

---

### Extracting logic into a custom Hook {/_extracting-logic-into-a-custom-hook_/}

Another approach you can try is to extract the "non-visual" logic into your own Hook, and use the information returned by your Hook to decide what to render. For example, you could write a `useList` custom Hook like this:

```js
import { useState } from 'react'

export default function useList(items) {
  const [selectedIndex, setSelectedIndex] = useState(0)

  function onNext() {
    setSelectedIndex((i) => (i + 1) % items.length)
  }

  const selected = items[selectedIndex]
  return [selected, onNext]
}
```

Then you could use it like this:

```js {2,9,13}
export default function App() {
  const [selected, onNext] = useList(products)
  return (
    <div className="List">
      {products.map((product) => (
        <Row
          key={product.id}
          title={product.title}
          isHighlighted={selected === product}
        />
      ))}
      <hr />
      <button onClick={onNext}>Next</button>
    </div>
  )
}
```

The data flow is explicit, but the state is inside the `useList` custom Hook that you can use from any component:

<Sandpack>

```js
import Row from './Row.js'
import useList from './useList.js'
import { products } from './data.js'

export default function App() {
  const [selected, onNext] = useList(products)
  return (
    <div className="List">
      {products.map((product) => (
        <Row
          key={product.id}
          title={product.title}
          isHighlighted={selected === product}
        />
      ))}
      <hr />
      <button onClick={onNext}>Next</button>
    </div>
  )
}
```

```js src/useList.js
import { useState } from 'react'

export default function useList(items) {
  const [selectedIndex, setSelectedIndex] = useState(0)

  function onNext() {
    setSelectedIndex((i) => (i + 1) % items.length)
  }

  const selected = items[selectedIndex]
  return [selected, onNext]
}
```

```js src/Row.js
export default function Row({ title, isHighlighted }) {
  return (
    <div className={['Row', isHighlighted ? 'RowHighlighted' : ''].join(' ')}>
      {title}
    </div>
  )
}
```

```js src/data.js
export const products = [
  { title: 'Cabbage', id: 1 },
  { title: 'Garlic', id: 2 },
  { title: 'Apple', id: 3 },
]
```

```css
.List {
  display: flex;
  flex-direction: column;
  border: 2px solid grey;
  padding: 5px;
}

.Row {
  border: 2px dashed black;
  padding: 5px;
  margin: 5px;
}

.RowHighlighted {
  background: #ffa;
}

button {
  height: 40px;
  font-size: 20px;
}
```

</Sandpack>

This approach is particularly useful if you want to reuse this logic between different components.
