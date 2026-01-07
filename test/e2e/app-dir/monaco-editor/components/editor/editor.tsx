'use client'

import { RefObject, Suspense, use, useEffect, useRef } from 'react'

// The monaco module uses `window` in the module scope, so when it executes it immediately throws.
// In order to avoid executing it on the server it's only imported in the browser.
// We leverage `use` to wait for the promise.
const maybeMonaco = typeof window === 'undefined' ? null : import('./monaco')

function LazyMonaco({
  editorRef,
}: {
  editorRef: RefObject<HTMLDivElement | null>
}) {
  const { monaco } = maybeMonaco === null ? {} : use(maybeMonaco)

  useEffect(() => {
    if (monaco && editorRef.current) {
      const monacoEditor = monaco.editor.create(editorRef.current, {
        value: "console.log('Hello, world!');",
        language: 'javascript',
        automaticLayout: true,
      })

      return () => {
        monacoEditor.dispose()
      }
    }
  }, [monaco, editorRef])

  return null
}

export function Editor() {
  const editorRef = useRef<HTMLDivElement>(null)
  return (
    <>
      <Suspense fallback="initalizing monaco">
        <LazyMonaco editorRef={editorRef} />
        <div id="editor" ref={editorRef} className="h-full" />
      </Suspense>
    </>
  )
}
