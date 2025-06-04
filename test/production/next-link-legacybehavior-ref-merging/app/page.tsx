'use client'
import Link from 'next/link'
import * as React from 'react'
import {
  useCallback,
  useState,
  type RefCallback,
  type Ref,
  type ComponentPropsWithRef,
  type ReactNode,
} from 'react'

export default function Page() {
  return (
    <>
      <h1>Home</h1>
      <ToggleVisibility>
        <Link href="/link-target" legacyBehavior>
          <AnchorThatDoesRefMerging id="test-link">
            Go to /link-target
          </AnchorThatDoesRefMerging>
        </Link>
      </ToggleVisibility>
    </>
  )
}

function ToggleVisibility({ children }: { children: ReactNode }) {
  const [isVisible, setIsVisible] = useState(true)
  return (
    <>
      <div>
        <button type="button" onClick={() => setIsVisible((prev) => !prev)}>
          {isVisible ? 'Hide content' : 'Show content'}
        </button>
      </div>
      {isVisible ? children : null}
    </>
  )
}

function AnchorThatDoesRefMerging({
  ref,
  children,
  ...anchorProps
}: ComponentPropsWithRef<'a'>) {
  const customRef: RefCallback<HTMLAnchorElement> = useCallback((el) => {
    if (el) {
      console.log('hello friends i am here')
    } else {
      console.log('goodbye friends i am gone')
    }
  }, [])

  const finalRef = useBuggyRefMerge(customRef, ref ?? null)
  return (
    <a ref={finalRef} {...anchorProps}>
      {children}
    </a>
  )
}

/** A ref-merging function that doesn't account for cleanup refs (added in React 19)
 * https://react.dev/blog/2024/12/05/react-19#cleanup-functions-for-refs
 */
function useBuggyRefMerge<TElement>(
  refA: Ref<TElement>,
  refB: Ref<TElement>
): RefCallback<TElement> {
  return useCallback(
    (current: TElement | null) => {
      for (const ref of [refA, refB]) {
        if (!ref) {
          continue
        }
        if (typeof ref === 'object') {
          ref.current = current
        } else {
          // BUG!!!
          // This would work in 18, but in 19 it can return a cleanup which will get swallowed here
          ref(current)
        }
      }
    },
    [refA, refB]
  )
}
