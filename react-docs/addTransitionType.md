---
title: addTransitionType
version: canary
---

<Canary>

**The `addTransitionType` API is currently only available in React’s Canary and Experimental channels.**

[Learn more about React’s release channels here.](/community/versioning-policy#all-release-channels)

</Canary>

<Intro>

`addTransitionType` lets you specify the cause of a transition.

```js
startTransition(() => {
  addTransitionType('my-transition-type')
  setState(newState)
})
```

</Intro>

<InlineToc />

---

## Reference {/_reference_/}

### `addTransitionType` {/_addtransitiontype_/}

#### Parameters {/_parameters_/}

- `type`: The type of transition to add. This can be any string.

#### Returns {/_returns_/}

`addTransitionType` does not return anything.

#### Caveats {/_caveats_/}

- If multiple transitions are combined, all Transition Types are collected. You can also add more than one type to a Transition.
- Transition Types are reset after each commit. This means a `<Suspense>` fallback will associate the types after a `startTransition`, but revealing the content does not.

---

## Usage {/_usage_/}

### Adding the cause of a transition {/_adding-the-cause-of-a-transition_/}

Call `addTransitionType` inside of `startTransition` to indicate the cause of a transition:

```[[1, 6, "addTransitionType"], [2, 5, "startTransition", [3, 6, "'submit-click'"]]
import { startTransition, addTransitionType } from 'react';

function Submit({action) {
  function handleClick() {
    startTransition(() => {
      addTransitionType('submit-click');
      action();
    });
  }

  return <button onClick={handleClick}>Click me</button>;
}

```

When you call <CodeStep step={1}>addTransitionType</CodeStep> inside the scope of <CodeStep step={2}>startTransition</CodeStep>, React will associate <CodeStep step={3}>submit-click</CodeStep> as one of the causes for the Transition.

Currently, Transition Types can be used to customize different animations based on what caused the Transition. You have three different ways to choose from for how to use them:

- [Customize animations using browser view transition types](#customize-animations-using-browser-view-transition-types)
- [Customize animations using `View Transition` Class](#customize-animations-using-view-transition-class)
- [Customize animations using `ViewTransition` events](#customize-animations-using-viewtransition-events)

In the future, we plan to support more use cases for using the cause of a transition.

---

### Customize animations using browser view transition types {/_customize-animations-using-browser-view-transition-types_/}

When a [`ViewTransition`](/reference/react/ViewTransition) activates from a transition, React adds all the Transition Types as browser [view transition types](https://www.w3.org/TR/css-view-transitions-2/#active-view-transition-pseudo-examples) to the element.

This allows you to customize different animations based on CSS scopes:

```js [11]
function Component() {
  return (
    <ViewTransition>
      <div>Hello</div>
    </ViewTransition>
  )
}

startTransition(() => {
  addTransitionType('my-transition-type')
  setShow(true)
})
```

```css
:root:active-view-transition-type(my-transition-type) {
  &::view-transition-...(...) {
    ...
  }
}
```

---

### Customize animations using `View Transition` Class {/_customize-animations-using-view-transition-class_/}

You can customize animations for an activated `ViewTransition` based on type by passing an object to the View Transition Class:

```js
function Component() {
  return (
    <ViewTransition
      enter={{
        'my-transition-type': 'my-transition-class',
      }}
    >
      <div>Hello</div>
    </ViewTransition>
  )
}

// ...
startTransition(() => {
  addTransitionType('my-transition-type')
  setState(newState)
})
```

If multiple types match, then they're joined together. If no types match then the special "default" entry is used instead. If any type has the value "none" then that wins and the ViewTransition is disabled (not assigned a name).

These can be combined with enter/exit/update/layout/share props to match based on kind of trigger and Transition Type.

```js
<ViewTransition enter={{
  'navigation-back': 'enter-right',
  'navigation-forward': 'enter-left',
}}
exit={{
  'navigation-back': 'exit-right',
  'navigation-forward': 'exit-left',
}}>
```

---

### Customize animations using `ViewTransition` events {/_customize-animations-using-viewtransition-events_/}

You can imperatively customize animations for an activated `ViewTransition` based on type using View Transition events:

```
<ViewTransition onUpdate={(inst, types) => {
  if (types.includes('navigation-back')) {
    ...
  } else if (types.includes('navigation-forward')) {
    ...
  } else {
    ...
  }
}}>
```

This allows you to pick different imperative Animations based on the cause.
