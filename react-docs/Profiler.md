---
title: <Profiler>
---

<Intro>

`<Profiler>` lets you measure rendering performance of a React tree programmatically.

```js
<Profiler id="App" onRender={onRender}>
  <App />
</Profiler>
```

</Intro>

<InlineToc />

---

## Reference {/_reference_/}

### `<Profiler>` {/_profiler_/}

Wrap a component tree in a `<Profiler>` to measure its rendering performance.

```js
<Profiler id="App" onRender={onRender}>
  <App />
</Profiler>
```

#### Props {/_props_/}

- `id`: A string identifying the part of the UI you are measuring.
- `onRender`: An [`onRender` callback](#onrender-callback) that React calls every time components within the profiled tree update. It receives information about what was rendered and how much time it took.

#### Caveats {/_caveats_/}

- Profiling adds some additional overhead, so **it is disabled in the production build by default.** To opt into production profiling, you need to enable a [special production build with profiling enabled.](/reference/dev-tools/react-performance-tracks#using-profiling-builds)

---

### `onRender` callback {/_onrender-callback_/}

React will call your `onRender` callback with information about what was rendered.

```js
function onRender(
  id,
  phase,
  actualDuration,
  baseDuration,
  startTime,
  commitTime
) {
  // Aggregate or log render timings...
}
```

#### Parameters {/_onrender-parameters_/}

- `id`: The string `id` prop of the `<Profiler>` tree that has just committed. This lets you identify which part of the tree was committed if you are using multiple profilers.
- `phase`: `"mount"`, `"update"` or `"nested-update"`. This lets you know whether the tree has just been mounted for the first time or re-rendered due to a change in props, state, or Hooks.
- `actualDuration`: The number of milliseconds spent rendering the `<Profiler>` and its descendants for the current update. This indicates how well the subtree makes use of memoization (e.g. [`memo`](/reference/react/memo) and [`useMemo`](/reference/react/useMemo)). Ideally this value should decrease significantly after the initial mount as many of the descendants will only need to re-render if their specific props change.
- `baseDuration`: The number of milliseconds estimating how much time it would take to re-render the entire `<Profiler>` subtree without any optimizations. It is calculated by summing up the most recent render durations of each component in the tree. This value estimates a worst-case cost of rendering (e.g. the initial mount or a tree with no memoization). Compare `actualDuration` against it to see if memoization is working.
- `startTime`: A numeric timestamp for when React began rendering the current update.
- `commitTime`: A numeric timestamp for when React committed the current update. This value is shared between all profilers in a commit, enabling them to be grouped if desirable.

---

## Usage {/_usage_/}

### Measuring rendering performance programmatically {/_measuring-rendering-performance-programmatically_/}

Wrap the `<Profiler>` component around a React tree to measure its rendering performance.

```js {2,4}
<App>
  <Profiler id="Sidebar" onRender={onRender}>
    <Sidebar />
  </Profiler>
  <PageContent />
</App>
```

It requires two props: an `id` (string) and an `onRender` callback (function) which React calls any time a component within the tree "commits" an update.

<Pitfall>

Profiling adds some additional overhead, so **it is disabled in the production build by default.** To opt into production profiling, you need to enable a [special production build with profiling enabled.](/reference/dev-tools/react-performance-tracks#using-profiling-builds)

</Pitfall>

<Note>

`<Profiler>` lets you gather measurements programmatically. If you're looking for an interactive profiler, try the Profiler tab in [React Developer Tools](/learn/react-developer-tools). It exposes similar functionality as a browser extension.

Components wrapped in `<Profiler>` will also be marked in the [Component tracks](/reference/dev-tools/react-performance-tracks#components) of React Performance tracks even in profiling builds.
In development builds, all components are marked in the Components track regardless of whether they're wrapped in `<Profiler>`.

</Note>

---

### Measuring different parts of the application {/_measuring-different-parts-of-the-application_/}

You can use multiple `<Profiler>` components to measure different parts of your application:

```js {5,7}
<App>
  <Profiler id="Sidebar" onRender={onRender}>
    <Sidebar />
  </Profiler>
  <Profiler id="Content" onRender={onRender}>
    <Content />
  </Profiler>
</App>
```

You can also nest `<Profiler>` components:

```js {5,7,9,12}
<App>
  <Profiler id="Sidebar" onRender={onRender}>
    <Sidebar />
  </Profiler>
  <Profiler id="Content" onRender={onRender}>
    <Content>
      <Profiler id="Editor" onRender={onRender}>
        <Editor />
      </Profiler>
      <Preview />
    </Content>
  </Profiler>
</App>
```

Although `<Profiler>` is a lightweight component, it should be used only when necessary. Each use adds some CPU and memory overhead to an application.

---
