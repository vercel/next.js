// Models the documentation-site payload profile: a deep, element-dominated
// tree (prose + syntax-highlighted code rendered as one span per token),
// a large nav structure, and only a handful of client components.
// Prose adapted from the react.dev useState reference (CC BY 4.0,
// https://github.com/reactjs/react.dev).
import '../bench.css'
import ThemeToggle from '../ui/theme-toggle'
import SearchInput from '../ui/search-input'
import Feedback from '../ui/feedback'
import CodeBlock, { PackageManagerBlock } from '../ui/server-code-block'
import Collapsible from '../ui/collapsible'
import DocsSidebar from '../ui/docs-sidebar'
import { tokenize } from '../lib/tokenize'
import { docsTree } from '../lib/data'

export const dynamic = 'force-dynamic'

const EXAMPLES = {
  basic: tokenize(`import { useState } from 'react';

function MyComponent() {
  const [age, setAge] = useState(28);
  const [name, setName] = useState('Taylor');
  const [todos, setTodos] = useState(() => createTodos());
  // ...
}`),
  counter: tokenize(`import { useState } from 'react';

export default function Counter() {
  const [count, setCount] = useState(0);

  function handleClick() {
    setCount(count + 1);
  }

  return (
    <button onClick={handleClick}>
      You pressed me {count} times
    </button>
  );
}`),
  updater: tokenize(`function handleClick() {
  setAge(a => a + 1); // setAge(42 => 43)
  setAge(a => a + 1); // setAge(43 => 44)
  setAge(a => a + 1); // setAge(44 => 45)
}`),
  object: tokenize(`setForm({
  ...form,
  firstName: 'Taylor'
});`),
  initializer: tokenize(`function TodoList() {
  const [todos, setTodos] = useState(createInitialTodos);
  // ...`),
  key: tokenize(`export default function App() {
  const [version, setVersion] = useState(0);

  function handleReset() {
    setVersion(version + 1);
  }

  return (
    <>
      <button onClick={handleReset}>Reset</button>
      <Form key={version} />
    </>
  );
}`),
}

function H2({ id, children }) {
  return (
    <h2 id={id}>
      <a href={'#' + id}>{children}</a>
    </h2>
  )
}
function H3({ id, children }) {
  return (
    <h3 id={id}>
      <a href={'#' + id}>{children}</a>
    </h3>
  )
}

export default function DocsPage() {
  return (
    <>
      <header className="app-header">
        <nav className="crumbs" aria-label="Breadcrumb">
          <strong>React</strong>
          <span className="sep">/</span>
          <span>Reference</span>
          <span className="sep">/</span>
          <span className="current">useState</span>
        </nav>
        <div className="header-spacer" />
        <SearchInput placeholder="Search docs…" />
        <ThemeToggle />
      </header>
      <div className="docs-shell">
        <DocsSidebar tree={docsTree} version="stable" />

        <article className="prose">
          <h1>useState</h1>
          <p className="lead">
            <code>useState</code> is a React Hook that lets you add a state
            variable to your component.
          </p>
          <CodeBlock
            lang="js"
            lines={tokenize(`const [state, setState] = useState(initialState)`)}
          />

          <PackageManagerBlock
            variants={[
              { label: 'npm', lines: tokenize('npm install react react-dom') },
              { label: 'pnpm', lines: tokenize('pnpm add react react-dom') },
              { label: 'yarn', lines: tokenize('yarn add react react-dom') },
              { label: 'bun', lines: tokenize('bun add react react-dom') },
            ]}
          />

          <H2 id="reference">Reference</H2>
          <H3 id="usestate">useState(initialState)</H3>
          <p>
            Call <code>useState</code> at the top level of your component to
            declare a state variable. The convention is to name state variables
            like <code>[something, setSomething]</code> using array
            destructuring.
          </p>
          <CodeBlock
            lang="js"
            filename="MyComponent.js"
            lines={EXAMPLES.basic}
          />

          <H3 id="parameters">Parameters</H3>
          <table className="api-table">
            <thead>
              <tr>
                <th>Parameter</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <code>initialState</code>
                </td>
                <td>
                  The value you want the state to be initially. It can be a
                  value of any type, but there is a special behavior for
                  functions: if you pass a function as <code>initialState</code>
                  , it will be treated as an initializer function. It should be
                  pure, should take no arguments, and should return a value of
                  any type.
                </td>
              </tr>
            </tbody>
          </table>

          <H3 id="returns">Returns</H3>
          <p>
            <code>useState</code> returns an array with exactly two values:
          </p>
          <ol>
            <li>
              The current state. During the first render, it will match the{' '}
              <code>initialState</code> you have passed.
            </li>
            <li>
              The <code>set</code> function that lets you update the state to a
              different value and trigger a re-render.
            </li>
          </ol>

          <div className="callout pitfall">
            <span className="callout-label">Pitfall</span>
            <p>
              Calling the <code>set</code> function does <em>not</em> change the
              current state in the already executing code. It only affects what{' '}
              <code>useState</code> will return starting from the next render.
            </p>
          </div>

          <H2 id="usage">Usage</H2>
          <H3 id="adding-state">Adding state to a component</H3>
          <p>
            Call <code>useState</code> at the top level of your component to
            declare one or more state variables.
          </p>
          <CodeBlock lang="js" filename="Counter.js" lines={EXAMPLES.counter} />
          <p>
            In this example, clicking the button increments the counter: React
            stores the next state, renders your component again with the new
            value, and updates the UI.
          </p>

          <H3 id="updater-functions">
            Updating state based on the previous state
          </H3>
          <p>
            Suppose the age is <code>42</code>. This handler calls{' '}
            <code>setAge(a =&gt; a + 1)</code> three times. Here,{' '}
            <code>a =&gt; a + 1</code> is an updater function. React puts your
            updater functions in a queue and, during the next render, calls them
            in the same order.
          </p>
          <CodeBlock lang="js" lines={EXAMPLES.updater} />

          <H3 id="objects-and-arrays">Updating objects and arrays in state</H3>
          <p>
            You can put objects and arrays into state. In React, state is
            considered read-only, so you should <em>replace</em> it rather than
            mutate your existing objects.
          </p>
          <CodeBlock lang="js" lines={EXAMPLES.object} />

          <H3 id="avoiding-recreating-state">
            Avoiding recreating the initial state
          </H3>
          <p>
            React saves the initial state once and ignores it on the next
            renders. If you pass the result of calling a function, it will be
            re-created on every render, which can be wasteful. Pass the
            initializer itself instead:
          </p>
          <CodeBlock lang="js" lines={EXAMPLES.initializer} />

          <H3 id="resetting-state-with-a-key">Resetting state with a key</H3>
          <p>
            You can reset a component's state by passing a different{' '}
            <code>key</code> to a component. In this example, the Reset button
            changes the <code>version</code> state variable, which is passed as
            a <code>key</code> to the <code>Form</code>. When the key changes,
            React re-creates the <code>Form</code> component (and all of its
            children) from scratch, so its state gets reset.
          </p>
          <CodeBlock lang="js" filename="App.js" lines={EXAMPLES.key} />

          <Collapsible
            summary="Deep dive: how batching interacts with updater functions"
            defaultOpen={false}
          >
            <p>
              React processes state updates after event handlers have finished
              running. This is called batching. If you need to update the same
              state variable multiple times before the next render, you can pass
              updater functions, which are queued and applied in order during
              the next render.
            </p>
            <p>
              Updater functions must be pure: they run during rendering, so they
              should only calculate the next state and return it, without side
              effects. In Strict Mode, React runs each updater function twice to
              help you find impurities.
            </p>
          </Collapsible>

          <H3 id="storing-functions">Storing a function in state</H3>
          <p>
            If you want to store a function in state, you have to wrap it in an
            arrow function on both sides, because functions passed to{' '}
            <code>useState</code> are otherwise treated as initializers and
            functions passed to <code>set</code> functions are treated as
            updaters.
          </p>
          <CodeBlock
            lang="js"
            lines={tokenize(`const [fn, setFn] = useState(() => someFunction);

function handleClick() {
  setFn(() => someOtherFunction);
}`)}
          />

          <H2 id="caveats">Caveats</H2>
          <ul>
            <li>
              <code>useState</code> is a Hook, so you can only call it at the
              top level of your component or your own Hooks. You can't call it
              inside loops or conditions. If you need that, extract a new
              component and move the state into it.
            </li>
            <li>
              In Strict Mode, React will call your initializer function twice in
              order to help you find accidental impurities. This is
              development-only behavior and does not affect production. If your
              initializer function is pure (as it should be), this should not
              affect the behavior.
            </li>
            <li>
              The <code>set</code> function only updates the state variable for
              the next render. If you read the state variable after calling the{' '}
              <code>set</code> function, you will still get the old value that
              was on the screen before your call.
            </li>
            <li>
              If the new value you provide is identical to the current state, as
              determined by an <code>Object.is</code> comparison, React will
              skip re-rendering the component and its children. This is an
              optimization.
            </li>
            <li>
              React batches state updates. It updates the screen after all the
              event handlers have run and have called their <code>set</code>{' '}
              functions. This prevents multiple re-renders during a single
              event. In the rare case that you need to force React to update the
              screen earlier, for example to access the DOM, you can use{' '}
              <code>flushSync</code>.
            </li>
          </ul>

          <div className="callout">
            <span className="callout-label">Note</span>
            <p>
              React uses <code>Object.is</code> to compare state values. If the
              next state is equal to the previous state, the update is skipped
              and your component is not re-rendered.
            </p>
          </div>

          <H2 id="troubleshooting">Troubleshooting</H2>
          <H3 id="updated-but-logging-old">
            I've updated the state, but logging gives me the old value
          </H3>
          <p>
            Calling the <code>set</code> function does not change state in the
            running code, because state behaves like a snapshot. If you need to
            use the next state, you can save it in a variable before passing it
            to the <code>set</code> function.
          </p>
          <H3 id="updated-but-screen-not-updating">
            I've updated the state, but the screen doesn't update
          </H3>
          <p>
            React ignores your update if the next state is equal to the previous
            state, as determined by an <code>Object.is</code> comparison. This
            usually happens when you change an object or an array in state
            directly.
          </p>
          <CodeBlock
            lang="js"
            lines={tokenize(`obj.x = 10;  // Wrong: mutating existing object
setObj(obj); // Doesn't do anything

// Instead, replace it with a new object:
setObj({
  ...obj,
  x: 10
});`)}
          />
          <H3 id="too-many-re-renders">
            I'm getting an error: "Too many re-renders"
          </H3>
          <p>
            You might get an error that says:{' '}
            <em>
              Too many re-renders. React limits the number of renders to prevent
              an infinite loop.
            </em>{' '}
            Typically, this means that you're unconditionally setting state
            during render, so your component enters a loop: render, set state
            (which causes a render), and so on. Very often, this is caused by a
            mistake in specifying an event handler:
          </p>
          <CodeBlock
            lang="js"
            lines={tokenize(`// Wrong: calls the handler during render
return <button onClick={handleClick()}>Click me</button>

// Correct: passes the handler down
return <button onClick={handleClick}>Click me</button>

// Correct: passes an inline function
return <button onClick={() => handleClick()}>Click me</button>`)}
          />
          <H3 id="initializer-runs-twice">
            My initializer or updater function runs twice
          </H3>
          <p>
            In Strict Mode, React will call some of your functions twice instead
            of once. This is development-only behavior that helps you keep
            components pure. React uses the result of one of the calls and
            ignores the result of the other call. As long as your component,
            initializer, and updater functions are pure, this shouldn't affect
            your logic.
          </p>

          <div className="callout">
            <span className="callout-label">Note</span>
            <p>
              Content adapted from the react.dev <code>useState</code> API
              reference, licensed CC BY 4.0.
            </p>
          </div>

          <Feedback prompt="Was this page helpful?" />
          <footer className="docs-footer">
            <a href="#">← useRef</a>
            <a href="#">useSyncExternalStore →</a>
          </footer>
        </article>

        <nav className="toc" aria-label="On this page">
          <h4>On this page</h4>
          <a href="#reference">Reference</a>
          <a href="#usestate" className="toc-h3">
            useState(initialState)
          </a>
          <a href="#parameters" className="toc-h3">
            Parameters
          </a>
          <a href="#returns" className="toc-h3">
            Returns
          </a>
          <a href="#usage">Usage</a>
          <a href="#adding-state" className="toc-h3">
            Adding state
          </a>
          <a href="#updater-functions" className="toc-h3">
            Updater functions
          </a>
          <a href="#objects-and-arrays" className="toc-h3">
            Objects and arrays
          </a>
          <a href="#avoiding-recreating-state" className="toc-h3">
            Initializer functions
          </a>
          <a href="#resetting-state-with-a-key" className="toc-h3">
            Resetting with a key
          </a>
          <a href="#troubleshooting">Troubleshooting</a>
        </nav>
      </div>
    </>
  )
}
