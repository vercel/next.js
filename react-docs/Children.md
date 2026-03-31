---
title: Children
---

<Pitfall>

Using `Children` is uncommon and can lead to fragile code. [See common alternatives.](#alternatives)

</Pitfall>

<Intro>

`Children` lets you manipulate and transform the JSX you received as the [`children` prop.](/learn/passing-props-to-a-component#passing-jsx-as-children)

```js
const mappedChildren = Children.map(children, (child) => (
  <div className="Row">{child}</div>
))
```

</Intro>

<InlineToc />

---

## Reference {/_reference_/}

### `Children.count(children)` {/_children-count_/}

Call `Children.count(children)` to count the number of children in the `children` data structure.

```js src/RowList.js active
import { Children } from 'react'

function RowList({ children }) {
  return (
    <>
      <h1>Total rows: {Children.count(children)}</h1>
      ...
    </>
  )
}
```

[See more examples below.](#counting-children)

#### Parameters {/_children-count-parameters_/}

- `children`: The value of the [`children` prop](/learn/passing-props-to-a-component#passing-jsx-as-children) received by your component.

#### Returns {/_children-count-returns_/}

The number of nodes inside these `children`.

#### Caveats {/_children-count-caveats_/}

- Empty nodes (`null`, `undefined`, and Booleans), strings, numbers, and [React elements](/reference/react/createElement) count as individual nodes. Arrays don't count as individual nodes, but their children do. **The traversal does not go deeper than React elements:** they don't get rendered, and their children aren't traversed. [Fragments](/reference/react/Fragment) don't get traversed.

---

### `Children.forEach(children, fn, thisArg?)` {/_children-foreach_/}

Call `Children.forEach(children, fn, thisArg?)` to run some code for each child in the `children` data structure.

```js src/RowList.js active
import { Children } from 'react';

function SeparatorList({ children }) {
  const result = [];
  Children.forEach(children, (child, index) => {
    result.push(child);
    result.push(<hr key={index} />);
  });
  // ...
```

[See more examples below.](#running-some-code-for-each-child)

#### Parameters {/_children-foreach-parameters_/}

- `children`: The value of the [`children` prop](/learn/passing-props-to-a-component#passing-jsx-as-children) received by your component.
- `fn`: The function you want to run for each child, similar to the [array `forEach` method](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/forEach) callback. It will be called with the child as the first argument and its index as the second argument. The index starts at `0` and increments on each call.
- **optional** `thisArg`: The [`this` value](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/this) with which the `fn` function should be called. If omitted, it's `undefined`.

#### Returns {/_children-foreach-returns_/}

`Children.forEach` returns `undefined`.

#### Caveats {/_children-foreach-caveats_/}

- Empty nodes (`null`, `undefined`, and Booleans), strings, numbers, and [React elements](/reference/react/createElement) count as individual nodes. Arrays don't count as individual nodes, but their children do. **The traversal does not go deeper than React elements:** they don't get rendered, and their children aren't traversed. [Fragments](/reference/react/Fragment) don't get traversed.

---

### `Children.map(children, fn, thisArg?)` {/_children-map_/}

Call `Children.map(children, fn, thisArg?)` to map or transform each child in the `children` data structure.

```js src/RowList.js active
import { Children } from 'react'

function RowList({ children }) {
  return (
    <div className="RowList">
      {Children.map(children, (child) => (
        <div className="Row">{child}</div>
      ))}
    </div>
  )
}
```

[See more examples below.](#transforming-children)

#### Parameters {/_children-map-parameters_/}

- `children`: The value of the [`children` prop](/learn/passing-props-to-a-component#passing-jsx-as-children) received by your component.
- `fn`: The mapping function, similar to the [array `map` method](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map) callback. It will be called with the child as the first argument and its index as the second argument. The index starts at `0` and increments on each call. You need to return a React node from this function. This may be an empty node (`null`, `undefined`, or a Boolean), a string, a number, a React element, or an array of other React nodes.
- **optional** `thisArg`: The [`this` value](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/this) with which the `fn` function should be called. If omitted, it's `undefined`.

#### Returns {/_children-map-returns_/}

If `children` is `null` or `undefined`, returns the same value.

Otherwise, returns a flat array consisting of the nodes you've returned from the `fn` function. The returned array will contain all nodes you returned except for `null` and `undefined`.

#### Caveats {/_children-map-caveats_/}

- Empty nodes (`null`, `undefined`, and Booleans), strings, numbers, and [React elements](/reference/react/createElement) count as individual nodes. Arrays don't count as individual nodes, but their children do. **The traversal does not go deeper than React elements:** they don't get rendered, and their children aren't traversed. [Fragments](/reference/react/Fragment) don't get traversed.

- If you return an element or an array of elements with keys from `fn`, **the returned elements' keys will be automatically combined with the key of the corresponding original item from `children`.** When you return multiple elements from `fn` in an array, their keys only need to be unique locally amongst each other.

---

### `Children.only(children)` {/_children-only_/}

Call `Children.only(children)` to assert that `children` represent a single React element.

```js
function Box({ children }) {
  const element = Children.only(children);
  // ...
```

#### Parameters {/_children-only-parameters_/}

- `children`: The value of the [`children` prop](/learn/passing-props-to-a-component#passing-jsx-as-children) received by your component.

#### Returns {/_children-only-returns_/}

If `children` [is a valid element,](/reference/react/isValidElement) returns that element.

Otherwise, throws an error.

#### Caveats {/_children-only-caveats_/}

- This method always **throws if you pass an array (such as the return value of `Children.map`) as `children`.** In other words, it enforces that `children` is a single React element, not that it's an array with a single element.

---

### `Children.toArray(children)` {/_children-toarray_/}

Call `Children.toArray(children)` to create an array out of the `children` data structure.

```js src/ReversedList.js active
import { Children } from 'react';

export default function ReversedList({ children }) {
  const result = Children.toArray(children);
  result.reverse();
  // ...
```

#### Parameters {/_children-toarray-parameters_/}

- `children`: The value of the [`children` prop](/learn/passing-props-to-a-component#passing-jsx-as-children) received by your component.

#### Returns {/_children-toarray-returns_/}

Returns a flat array of elements in `children`.

#### Caveats {/_children-toarray-caveats_/}

- Empty nodes (`null`, `undefined`, and Booleans) will be omitted in the returned array. **The returned elements' keys will be calculated from the original elements' keys and their level of nesting and position.** This ensures that flattening the array does not introduce changes in behavior.

---

## Usage {/_usage_/}

### Transforming children {/_transforming-children_/}

To transform the children JSX that your component [receives as the `children` prop,](/learn/passing-props-to-a-component#passing-jsx-as-children) call `Children.map`:

```js {6,10}
import { Children } from 'react'

function RowList({ children }) {
  return (
    <div className="RowList">
      {Children.map(children, (child) => (
        <div className="Row">{child}</div>
      ))}
    </div>
  )
}
```

In the example above, the `RowList` wraps every child it receives into a `<div className="Row">` container. For example, let's say the parent component passes three `<p>` tags as the `children` prop to `RowList`:

```js
<RowList>
  <p>This is the first item.</p>
  <p>This is the second item.</p>
  <p>This is the third item.</p>
</RowList>
```

Then, with the `RowList` implementation above, the final rendered result will look like this:

```js
<div className="RowList">
  <div className="Row">
    <p>This is the first item.</p>
  </div>
  <div className="Row">
    <p>This is the second item.</p>
  </div>
  <div className="Row">
    <p>This is the third item.</p>
  </div>
</div>
```

`Children.map` is similar to [to transforming arrays with `map()`.](/learn/rendering-lists) The difference is that the `children` data structure is considered _opaque._ This means that even if it's sometimes an array, you should not assume it's an array or any other particular data type. This is why you should use `Children.map` if you need to transform it.

<Sandpack>

```js
import RowList from './RowList.js'

export default function App() {
  return (
    <RowList>
      <p>This is the first item.</p>
      <p>This is the second item.</p>
      <p>This is the third item.</p>
    </RowList>
  )
}
```

```js src/RowList.js active
import { Children } from 'react'

export default function RowList({ children }) {
  return (
    <div className="RowList">
      {Children.map(children, (child) => (
        <div className="Row">{child}</div>
      ))}
    </div>
  )
}
```

```css
.RowList {
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
```

</Sandpack>

<DeepDive>

#### Why is the children prop not always an array? {/_why-is-the-children-prop-not-always-an-array_/}

In React, the `children` prop is considered an _opaque_ data structure. This means that you shouldn't rely on how it is structured. To transform, filter, or count children, you should use the `Children` methods.

In practice, the `children` data structure is often represented as an array internally. However, if there is only a single child, then React won't create an extra array since this would lead to unnecessary memory overhead. As long as you use the `Children` methods instead of directly introspecting the `children` prop, your code will not break even if React changes how the data structure is actually implemented.

Even when `children` is an array, `Children.map` has useful special behavior. For example, `Children.map` combines the [keys](/learn/rendering-lists#keeping-list-items-in-order-with-key) on the returned elements with the keys on the `children` you've passed to it. This ensures the original JSX children don't "lose" keys even if they get wrapped like in the example above.

</DeepDive>

<Pitfall>

The `children` data structure **does not include rendered output** of the components you pass as JSX. In the example below, the `children` received by the `RowList` only contains two items rather than three:

1. `<p>This is the first item.</p>`
2. `<MoreRows />`

This is why only two row wrappers are generated in this example:

<Sandpack>

```js
import RowList from './RowList.js'

export default function App() {
  return (
    <RowList>
      <p>This is the first item.</p>
      <MoreRows />
    </RowList>
  )
}

function MoreRows() {
  return (
    <>
      <p>This is the second item.</p>
      <p>This is the third item.</p>
    </>
  )
}
```

```js src/RowList.js
import { Children } from 'react'

export default function RowList({ children }) {
  return (
    <div className="RowList">
      {Children.map(children, (child) => (
        <div className="Row">{child}</div>
      ))}
    </div>
  )
}
```

```css
.RowList {
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
```

</Sandpack>

**There is no way to get the rendered output of an inner component** like `<MoreRows />` when manipulating `children`. This is why [it's usually better to use one of the alternative solutions.](#alternatives)

</Pitfall>

---

### Running some code for each child {/_running-some-code-for-each-child_/}

Call `Children.forEach` to iterate over each child in the `children` data structure. It does not return any value and is similar to the [array `forEach` method.](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/forEach) You can use it to run custom logic like constructing your own array.

<Sandpack>

```js
import SeparatorList from './SeparatorList.js'

export default function App() {
  return (
    <SeparatorList>
      <p>This is the first item.</p>
      <p>This is the second item.</p>
      <p>This is the third item.</p>
    </SeparatorList>
  )
}
```

```js src/SeparatorList.js active
import { Children } from 'react'

export default function SeparatorList({ children }) {
  const result = []
  Children.forEach(children, (child, index) => {
    result.push(child)
    result.push(<hr key={index} />)
  })
  result.pop() // Remove the last separator
  return result
}
```

</Sandpack>

<Pitfall>

As mentioned earlier, there is no way to get the rendered output of an inner component when manipulating `children`. This is why [it's usually better to use one of the alternative solutions.](#alternatives)

</Pitfall>

---

### Counting children {/_counting-children_/}

Call `Children.count(children)` to calculate the number of children.

<Sandpack>

```js
import RowList from './RowList.js'

export default function App() {
  return (
    <RowList>
      <p>This is the first item.</p>
      <p>This is the second item.</p>
      <p>This is the third item.</p>
    </RowList>
  )
}
```

```js src/RowList.js active
import { Children } from 'react'

export default function RowList({ children }) {
  return (
    <div className="RowList">
      <h1 className="RowListHeader">Total rows: {Children.count(children)}</h1>
      {Children.map(children, (child) => (
        <div className="Row">{child}</div>
      ))}
    </div>
  )
}
```

```css
.RowList {
  display: flex;
  flex-direction: column;
  border: 2px solid grey;
  padding: 5px;
}

.RowListHeader {
  padding-top: 5px;
  font-size: 25px;
  font-weight: bold;
  text-align: center;
}

.Row {
  border: 2px dashed black;
  padding: 5px;
  margin: 5px;
}
```

</Sandpack>

<Pitfall>

As mentioned earlier, there is no way to get the rendered output of an inner component when manipulating `children`. This is why [it's usually better to use one of the alternative solutions.](#alternatives)

</Pitfall>

---

### Converting children to an array {/_converting-children-to-an-array_/}

Call `Children.toArray(children)` to turn the `children` data structure into a regular JavaScript array. This lets you manipulate the array with built-in array methods like [`filter`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/filter), [`sort`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort), or [`reverse`.](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/reverse)

<Sandpack>

```js
import ReversedList from './ReversedList.js'

export default function App() {
  return (
    <ReversedList>
      <p>This is the first item.</p>
      <p>This is the second item.</p>
      <p>This is the third item.</p>
    </ReversedList>
  )
}
```

```js src/ReversedList.js active
import { Children } from 'react'

export default function ReversedList({ children }) {
  const result = Children.toArray(children)
  result.reverse()
  return result
}
```

</Sandpack>

<Pitfall>

As mentioned earlier, there is no way to get the rendered output of an inner component when manipulating `children`. This is why [it's usually better to use one of the alternative solutions.](#alternatives)

</Pitfall>

---

## Alternatives {/_alternatives_/}

<Note>

This section describes alternatives to the `Children` API (with capital `C`) that's imported like this:

```js
import { Children } from 'react'
```

Don't confuse it with [using the `children` prop](/learn/passing-props-to-a-component#passing-jsx-as-children) (lowercase `c`), which is good and encouraged.

</Note>

### Exposing multiple components {/_exposing-multiple-components_/}

Manipulating children with the `Children` methods often leads to fragile code. When you pass children to a component in JSX, you don't usually expect the component to manipulate or transform the individual children.

When you can, try to avoid using the `Children` methods. For example, if you want every child of `RowList` to be wrapped in `<div className="Row">`, export a `Row` component, and manually wrap every row into it like this:

<Sandpack>

```js
import { RowList, Row } from './RowList.js'

export default function App() {
  return (
    <RowList>
      <Row>
        <p>This is the first item.</p>
      </Row>
      <Row>
        <p>This is the second item.</p>
      </Row>
      <Row>
        <p>This is the third item.</p>
      </Row>
    </RowList>
  )
}
```

```js src/RowList.js
export function RowList({ children }) {
  return <div className="RowList">{children}</div>
}

export function Row({ children }) {
  return <div className="Row">{children}</div>
}
```

```css
.RowList {
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
```

</Sandpack>

Unlike using `Children.map`, this approach does not wrap every child automatically. **However, this approach has a significant benefit compared to the [earlier example with `Children.map`](#transforming-children) because it works even if you keep extracting more components.** For example, it still works if you extract your own `MoreRows` component:

<Sandpack>

```js
import { RowList, Row } from './RowList.js'

export default function App() {
  return (
    <RowList>
      <Row>
        <p>This is the first item.</p>
      </Row>
      <MoreRows />
    </RowList>
  )
}

function MoreRows() {
  return (
    <>
      <Row>
        <p>This is the second item.</p>
      </Row>
      <Row>
        <p>This is the third item.</p>
      </Row>
    </>
  )
}
```

```js src/RowList.js
export function RowList({ children }) {
  return <div className="RowList">{children}</div>
}

export function Row({ children }) {
  return <div className="Row">{children}</div>
}
```

```css
.RowList {
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
```

</Sandpack>

This wouldn't work with `Children.map` because it would "see" `<MoreRows />` as a single child (and a single row).

---

### Accepting an array of objects as a prop {/_accepting-an-array-of-objects-as-a-prop_/}

You can also explicitly pass an array as a prop. For example, this `RowList` accepts a `rows` array as a prop:

<Sandpack>

```js
import { RowList, Row } from './RowList.js'

export default function App() {
  return (
    <RowList
      rows={[
        { id: 'first', content: <p>This is the first item.</p> },
        { id: 'second', content: <p>This is the second item.</p> },
        { id: 'third', content: <p>This is the third item.</p> },
      ]}
    />
  )
}
```

```js src/RowList.js
export function RowList({ rows }) {
  return (
    <div className="RowList">
      {rows.map((row) => (
        <div className="Row" key={row.id}>
          {row.content}
        </div>
      ))}
    </div>
  )
}
```

```css
.RowList {
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
```

</Sandpack>

Since `rows` is a regular JavaScript array, the `RowList` component can use built-in array methods like [`map`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map) on it.

This pattern is especially useful when you want to be able to pass more information as structured data together with children. In the below example, the `TabSwitcher` component receives an array of objects as the `tabs` prop:

<Sandpack>

```js
import TabSwitcher from './TabSwitcher.js'

export default function App() {
  return (
    <TabSwitcher
      tabs={[
        {
          id: 'first',
          header: 'First',
          content: <p>This is the first item.</p>,
        },
        {
          id: 'second',
          header: 'Second',
          content: <p>This is the second item.</p>,
        },
        {
          id: 'third',
          header: 'Third',
          content: <p>This is the third item.</p>,
        },
      ]}
    />
  )
}
```

```js src/TabSwitcher.js
import { useState } from 'react'

export default function TabSwitcher({ tabs }) {
  const [selectedId, setSelectedId] = useState(tabs[0].id)
  const selectedTab = tabs.find((tab) => tab.id === selectedId)
  return (
    <>
      {tabs.map((tab) => (
        <button key={tab.id} onClick={() => setSelectedId(tab.id)}>
          {tab.header}
        </button>
      ))}
      <hr />
      <div key={selectedId}>
        <h3>{selectedTab.header}</h3>
        {selectedTab.content}
      </div>
    </>
  )
}
```

</Sandpack>

Unlike passing the children as JSX, this approach lets you associate some extra data like `header` with each item. Because you are working with the `tabs` directly, and it is an array, you do not need the `Children` methods.

---

### Calling a render prop to customize rendering {/_calling-a-render-prop-to-customize-rendering_/}

Instead of producing JSX for every single item, you can also pass a function that returns JSX, and call that function when necessary. In this example, the `App` component passes a `renderContent` function to the `TabSwitcher` component. The `TabSwitcher` component calls `renderContent` only for the selected tab:

<Sandpack>

```js
import TabSwitcher from './TabSwitcher.js'

export default function App() {
  return (
    <TabSwitcher
      tabIds={['first', 'second', 'third']}
      getHeader={(tabId) => {
        return tabId[0].toUpperCase() + tabId.slice(1)
      }}
      renderContent={(tabId) => {
        return <p>This is the {tabId} item.</p>
      }}
    />
  )
}
```

```js src/TabSwitcher.js
import { useState } from 'react'

export default function TabSwitcher({ tabIds, getHeader, renderContent }) {
  const [selectedId, setSelectedId] = useState(tabIds[0])
  return (
    <>
      {tabIds.map((tabId) => (
        <button key={tabId} onClick={() => setSelectedId(tabId)}>
          {getHeader(tabId)}
        </button>
      ))}
      <hr />
      <div key={selectedId}>
        <h3>{getHeader(selectedId)}</h3>
        {renderContent(selectedId)}
      </div>
    </>
  )
}
```

</Sandpack>

A prop like `renderContent` is called a _render prop_ because it is a prop that specifies how to render a piece of the user interface. However, there is nothing special about it: it is a regular prop which happens to be a function.

Render props are functions, so you can pass information to them. For example, this `RowList` component passes the `id` and the `index` of each row to the `renderRow` render prop, which uses `index` to highlight even rows:

<Sandpack>

```js
import { RowList, Row } from './RowList.js'

export default function App() {
  return (
    <RowList
      rowIds={['first', 'second', 'third']}
      renderRow={(id, index) => {
        return (
          <Row isHighlighted={index % 2 === 0}>
            <p>This is the {id} item.</p>
          </Row>
        )
      }}
    />
  )
}
```

```js src/RowList.js
import { Fragment } from 'react'

export function RowList({ rowIds, renderRow }) {
  return (
    <div className="RowList">
      <h1 className="RowListHeader">Total rows: {rowIds.length}</h1>
      {rowIds.map((rowId, index) => (
        <Fragment key={rowId}>{renderRow(rowId, index)}</Fragment>
      ))}
    </div>
  )
}

export function Row({ children, isHighlighted }) {
  return (
    <div className={['Row', isHighlighted ? 'RowHighlighted' : ''].join(' ')}>
      {children}
    </div>
  )
}
```

```css
.RowList {
  display: flex;
  flex-direction: column;
  border: 2px solid grey;
  padding: 5px;
}

.RowListHeader {
  padding-top: 5px;
  font-size: 25px;
  font-weight: bold;
  text-align: center;
}

.Row {
  border: 2px dashed black;
  padding: 5px;
  margin: 5px;
}

.RowHighlighted {
  background: #ffa;
}
```

</Sandpack>

This is another example of how parent and child components can cooperate without manipulating the children.

---

## Troubleshooting {/_troubleshooting_/}

### I pass a custom component, but the `Children` methods don't show its render result {/_i-pass-a-custom-component-but-the-children-methods-dont-show-its-render-result_/}

Suppose you pass two children to `RowList` like this:

```js
<RowList>
  <p>First item</p>
  <MoreRows />
</RowList>
```

If you do `Children.count(children)` inside `RowList`, you will get `2`. Even if `MoreRows` renders 10 different items, or if it returns `null`, `Children.count(children)` will still be `2`. From the `RowList`'s perspective, it only "sees" the JSX it has received. It does not "see" the internals of the `MoreRows` component.

The limitation makes it hard to extract a component. This is why [alternatives](#alternatives) are preferred to using `Children`.
