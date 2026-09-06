// Models the documentation-site payload profile: a deep, element-dominated
// tree (prose + syntax-highlighted code rendered as one span per token),
// a large nav structure, and only a handful of client components.
// Prose adapted from the react.dev useState reference (CC BY 4.0,
// https://github.com/reactjs/react.dev).
import '../bench.css'
import ThemeToggle from '../ui/theme-toggle'
import DocsSearch from '../ui/docs-search'
import VersionPicker from '../ui/version-picker'
import MobileNav from '../ui/mobile-nav'
import TocScrollspy from '../ui/toc-scrollspy'
import CopyPageButton from '../ui/copy-page-button'
import DocsPager from '../ui/docs-pager'
import AnnouncementBanner from '../ui/announcement-banner'
import ScrollToTop from '../ui/scroll-to-top'
import Feedback from '../ui/feedback'
import CodeBlock, { PackageManagerBlock } from '../ui/server-code-block'
import Collapsible from '../ui/collapsible'
import DocsSidebar from '../ui/docs-sidebar'
import IconBook from '../ui/icons/book'
import IconHash from '../ui/icons/hash'
import IconMenu from '../ui/icons/menu'
import IconClose from '../ui/icons/close'
import IconFileText from '../ui/icons/file-text'
import IconList from '../ui/icons/list'
import IconMessageSquare from '../ui/icons/message-square'
import IconEdit from '../ui/icons/edit'
import IconClipboard from '../ui/icons/clipboard'
import IconChevronRight from '../ui/icons/chevron-right'
import IconArrowLeft from '../ui/icons/arrow-left'
import IconArrowRight from '../ui/icons/arrow-right'
import IconGithub from '../ui/icons/github'
import IconDiscord from '../ui/icons/discord'
import IconLightbulb from '../ui/icons/lightbulb'
import IconInfo from '../ui/icons/info'
import IconAlertTriangle from '../ui/icons/alert-triangle'
import IconLanguages from '../ui/icons/languages'
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
      <a href={'#' + id}>
        {children}
        <IconHash size={13} />
      </a>
    </h2>
  )
}
function H3({ id, children }) {
  return (
    <h3 id={id}>
      <a href={'#' + id}>
        {children}
        <IconHash size={12} />
      </a>
    </h3>
  )
}

const TOC_ITEMS = [
  { id: 'reference', label: 'Reference', level: 2 },
  { id: 'usestate', label: 'useState(initialState)', level: 3 },
  { id: 'parameters', label: 'Parameters', level: 3 },
  { id: 'returns', label: 'Returns', level: 3 },
  { id: 'usage', label: 'Usage', level: 2 },
  { id: 'adding-state', label: 'Adding state', level: 3 },
  { id: 'updater-functions', label: 'Updater functions', level: 3 },
  { id: 'objects-and-arrays', label: 'Objects and arrays', level: 3 },
  { id: 'avoiding-recreating-state', label: 'Initializer functions', level: 3 },
  { id: 'resetting-state-with-a-key', label: 'Resetting with a key', level: 3 },
  { id: 'troubleshooting', label: 'Troubleshooting', level: 2 },
]

export default function DocsPage() {
  return (
    <>
      <AnnouncementBanner>
        <span>
          React Conf 2026 registration is open{' '}
          <a href="#">
            Get tickets <IconArrowRight size={12} />
          </a>
        </span>
      </AnnouncementBanner>
      <header className="app-header">
        <MobileNav
          label="Toggle navigation"
          openIcon={<IconMenu size={16} />}
          closeIcon={<IconClose size={16} />}
        />
        <nav className="crumbs" aria-label="Breadcrumb">
          <IconBook size={14} />
          <strong>React</strong>
          <IconChevronRight size={12} />
          <span>Reference</span>
          <IconChevronRight size={12} />
          <span className="current">useState</span>
        </nav>
        <div className="header-spacer" />
        <DocsSearch placeholder="Search docs…" />
        <VersionPicker versions={['stable', 'v15', 'v14']} current="stable" />
        <ThemeToggle />
      </header>
      <div className="docs-shell">
        <DocsSidebar tree={docsTree} version="stable" />

        <article className="prose">
          <div className="page-actions flex items-center gap-2">
            <CopyPageButton icon={<IconClipboard size={13} />} />
            <a href="#" className="text-xs text-muted">
              <IconEdit size={13} /> Edit this page
            </a>
            <a href="#" className="text-xs text-muted">
              <IconFileText size={13} /> View as Markdown
            </a>
            <a href="#" className="text-xs text-muted">
              <IconLanguages size={13} /> Translations
            </a>
          </div>
          <h1>useState</h1>
          <p className="lead">
            <code className="inline-code" dir="ltr">
              useState
            </code>{' '}
            is a React Hook that lets you add a state variable to your
            component.
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
          <p className="prose-p">
            Call{' '}
            <code className="inline-code" dir="ltr">
              useState
            </code>{' '}
            at the top level of your component to declare a state variable. The
            convention is to name state variables like{' '}
            <code className="inline-code" dir="ltr">
              [something, setSomething]
            </code>{' '}
            using array destructuring.
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
                  <code className="inline-code" dir="ltr">
                    initialState
                  </code>
                </td>
                <td>
                  The value you want the state to be initially. It can be a
                  value of any type, but there is a special behavior for
                  functions: if you pass a function as{' '}
                  <code className="inline-code" dir="ltr">
                    initialState
                  </code>
                  , it will be treated as an initializer function. It should be
                  pure, should take no arguments, and should return a value of
                  any type.
                </td>
              </tr>
            </tbody>
          </table>

          <H3 id="returns">Returns</H3>
          <p className="prose-p">
            <code className="inline-code" dir="ltr">
              useState
            </code>{' '}
            returns an array with exactly two values:
          </p>
          <ol className="prose-list prose-list-ordered">
            <li className="prose-li">
              The current state. During the first render, it will match the{' '}
              <code className="inline-code" dir="ltr">
                initialState
              </code>{' '}
              you have passed.
            </li>
            <li className="prose-li">
              The{' '}
              <code className="inline-code" dir="ltr">
                set
              </code>{' '}
              function that lets you update the state to a different value and
              trigger a re-render.
            </li>
          </ol>

          <div className="callout pitfall">
            <span className="callout-label">
              <IconAlertTriangle size={13} /> Pitfall
            </span>
            <p className="prose-p">
              Calling the{' '}
              <code className="inline-code" dir="ltr">
                set
              </code>{' '}
              function does <em>not</em> change the current state in the already
              executing code. It only affects what{' '}
              <code className="inline-code" dir="ltr">
                useState
              </code>{' '}
              will return starting from the next render.
            </p>
          </div>

          <H2 id="usage">Usage</H2>
          <H3 id="adding-state">Adding state to a component</H3>
          <p className="prose-p">
            Call{' '}
            <code className="inline-code" dir="ltr">
              useState
            </code>{' '}
            at the top level of your component to declare one or more state
            variables.
          </p>
          <CodeBlock lang="js" filename="Counter.js" lines={EXAMPLES.counter} />
          <p className="prose-p">
            In this example, clicking the button increments the counter: React
            stores the next state, renders your component again with the new
            value, and updates the UI.
          </p>

          <H3 id="updater-functions">
            Updating state based on the previous state
          </H3>
          <p className="prose-p">
            Suppose the age is{' '}
            <code className="inline-code" dir="ltr">
              42
            </code>
            . This handler calls{' '}
            <code className="inline-code" dir="ltr">
              setAge(a =&gt; a + 1)
            </code>{' '}
            three times. Here,{' '}
            <code className="inline-code" dir="ltr">
              a =&gt; a + 1
            </code>{' '}
            is an updater function. React puts your updater functions in a queue
            and, during the next render, calls them in the same order.
          </p>
          <CodeBlock lang="js" lines={EXAMPLES.updater} />

          <div className="callout tip">
            <span className="callout-label">
              <IconLightbulb size={13} /> Tip
            </span>
            <p className="prose-p">
              If you find yourself passing several updater functions in a row,
              it is often simpler to compute the next state once and pass the
              value directly.
            </p>
          </div>

          <H3 id="objects-and-arrays">Updating objects and arrays in state</H3>
          <p className="prose-p">
            You can put objects and arrays into state. In React, state is
            considered read-only, so you should <em>replace</em> it rather than
            mutate your existing objects.
          </p>
          <CodeBlock lang="js" lines={EXAMPLES.object} />

          <H3 id="avoiding-recreating-state">
            Avoiding recreating the initial state
          </H3>
          <p className="prose-p">
            React saves the initial state once and ignores it on the next
            renders. If you pass the result of calling a function, it will be
            re-created on every render, which can be wasteful. Pass the
            initializer itself instead:
          </p>
          <CodeBlock lang="js" lines={EXAMPLES.initializer} />

          <H3 id="resetting-state-with-a-key">Resetting state with a key</H3>
          <p className="prose-p">
            You can reset a component's state by passing a different{' '}
            <code className="inline-code" dir="ltr">
              key
            </code>{' '}
            to a component. In this example, the Reset button changes the{' '}
            <code className="inline-code" dir="ltr">
              version
            </code>{' '}
            state variable, which is passed as a{' '}
            <code className="inline-code" dir="ltr">
              key
            </code>{' '}
            to the{' '}
            <code className="inline-code" dir="ltr">
              Form
            </code>
            . When the key changes, React re-creates the{' '}
            <code className="inline-code" dir="ltr">
              Form
            </code>{' '}
            component (and all of its children) from scratch, so its state gets
            reset.
          </p>
          <CodeBlock lang="js" filename="App.js" lines={EXAMPLES.key} />

          <Collapsible
            summary="Deep dive: how batching interacts with updater functions"
            defaultOpen={false}
          >
            <p className="prose-p">
              React processes state updates after event handlers have finished
              running. This is called batching. If you need to update the same
              state variable multiple times before the next render, you can pass
              updater functions, which are queued and applied in order during
              the next render.
            </p>
            <p className="prose-p">
              Updater functions must be pure: they run during rendering, so they
              should only calculate the next state and return it, without side
              effects. In Strict Mode, React runs each updater function twice to
              help you find impurities.
            </p>
          </Collapsible>

          <H3 id="storing-functions">Storing a function in state</H3>
          <p className="prose-p">
            If you want to store a function in state, you have to wrap it in an
            arrow function on both sides, because functions passed to{' '}
            <code className="inline-code" dir="ltr">
              useState
            </code>{' '}
            are otherwise treated as initializers and functions passed to{' '}
            <code className="inline-code" dir="ltr">
              set
            </code>{' '}
            functions are treated as updaters.
          </p>
          <CodeBlock
            lang="js"
            lines={tokenize(`const [fn, setFn] = useState(() => someFunction);

function handleClick() {
  setFn(() => someOtherFunction);
}`)}
          />

          <H2 id="caveats">Caveats</H2>
          <ul className="prose-list">
            <li className="prose-li">
              <code className="inline-code" dir="ltr">
                useState
              </code>{' '}
              is a Hook, so you can only call it at the top level of your
              component or your own Hooks. You can't call it inside loops or
              conditions. If you need that, extract a new component and move the
              state into it.
            </li>
            <li className="prose-li">
              In Strict Mode, React will call your initializer function twice in
              order to help you find accidental impurities. This is
              development-only behavior and does not affect production. If your
              initializer function is pure (as it should be), this should not
              affect the behavior.
            </li>
            <li className="prose-li">
              The{' '}
              <code className="inline-code" dir="ltr">
                set
              </code>{' '}
              function only updates the state variable for the next render. If
              you read the state variable after calling the{' '}
              <code className="inline-code" dir="ltr">
                set
              </code>{' '}
              function, you will still get the old value that was on the screen
              before your call.
            </li>
            <li className="prose-li">
              If the new value you provide is identical to the current state, as
              determined by an{' '}
              <code className="inline-code" dir="ltr">
                Object.is
              </code>{' '}
              comparison, React will skip re-rendering the component and its
              children. This is an optimization.
            </li>
            <li className="prose-li">
              React batches state updates. It updates the screen after all the
              event handlers have run and have called their{' '}
              <code className="inline-code" dir="ltr">
                set
              </code>{' '}
              functions. This prevents multiple re-renders during a single
              event. In the rare case that you need to force React to update the
              screen earlier, for example to access the DOM, you can use{' '}
              <code className="inline-code" dir="ltr">
                flushSync
              </code>
              .
            </li>
          </ul>

          <div className="callout">
            <span className="callout-label">
              <IconInfo size={13} /> Note
            </span>
            <p className="prose-p">
              React uses{' '}
              <code className="inline-code" dir="ltr">
                Object.is
              </code>{' '}
              to compare state values. If the next state is equal to the
              previous state, the update is skipped and your component is not
              re-rendered.
            </p>
          </div>

          <H2 id="troubleshooting">Troubleshooting</H2>
          <H3 id="updated-but-logging-old">
            I've updated the state, but logging gives me the old value
          </H3>
          <p className="prose-p">
            Calling the{' '}
            <code className="inline-code" dir="ltr">
              set
            </code>{' '}
            function does not change state in the running code, because state
            behaves like a snapshot. If you need to use the next state, you can
            save it in a variable before passing it to the{' '}
            <code className="inline-code" dir="ltr">
              set
            </code>{' '}
            function.
          </p>
          <H3 id="updated-but-screen-not-updating">
            I've updated the state, but the screen doesn't update
          </H3>
          <p className="prose-p">
            React ignores your update if the next state is equal to the previous
            state, as determined by an{' '}
            <code className="inline-code" dir="ltr">
              Object.is
            </code>{' '}
            comparison. This usually happens when you change an object or an
            array in state directly.
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
          <p className="prose-p">
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
          <p className="prose-p">
            In Strict Mode, React will call some of your functions twice instead
            of once. This is development-only behavior that helps you keep
            components pure. React uses the result of one of the calls and
            ignores the result of the other call. As long as your component,
            initializer, and updater functions are pure, this shouldn't affect
            your logic.
          </p>

          <div className="callout">
            <span className="callout-label">
              <IconInfo size={13} /> Note
            </span>
            <p className="prose-p">
              Content adapted from the react.dev{' '}
              <code className="inline-code" dir="ltr">
                useState
              </code>{' '}
              API reference, licensed CC BY 4.0.
            </p>
          </div>

          <Feedback prompt="Was this page helpful?" />
          <DocsPager
            prev={{ title: 'useRef', href: '#' }}
            next={{ title: 'useSyncExternalStore', href: '#' }}
            prevIcon={<IconArrowLeft size={14} />}
            nextIcon={<IconArrowRight size={14} />}
          />
          <footer className="docs-footer">
            <a href="#">
              <IconGithub size={13} /> Edit on GitHub
            </a>
            <a href="#">
              <IconDiscord size={13} /> Join the community
            </a>
            <a href="#">
              <IconMessageSquare size={13} /> Discuss on the forum
            </a>
          </footer>
        </article>

        <nav className="toc" aria-label="On this page">
          <h4>
            <IconList size={13} /> On this page
          </h4>
          <TocScrollspy items={TOC_ITEMS} />
          <ScrollToTop />
        </nav>
      </div>
    </>
  )
}
