import { css } from '../../utils/css'

export function DocsLink({
  href,
  children,
}: {
  href: string
  children: string
}) {
  return (
    <a data-nextjs-guidance-fix-link href={href}>
      {children} &rarr;
    </a>
  )
}

export function FixDiff({ lines }: { lines: string }) {
  return (
    <pre data-nextjs-fix-diff>
      {lines.split('\n').map((line, i) => {
        let type: 'add' | 'remove' | 'context' = 'context'
        if (line.startsWith('+')) type = 'add'
        else if (line.startsWith('-')) type = 'remove'
        return (
          <span key={i} data-diff-type={type}>
            {line}
            {'\n'}
          </span>
        )
      })}
    </pre>
  )
}

export function ErrorExplanation({ children }: { children: React.ReactNode }) {
  return <div data-nextjs-error-explanation>{children}</div>
}

export const SHARED_GUIDANCE_STYLES = css`
  [data-nextjs-error-explanation] {
    margin-bottom: 12px;
    padding: 10px 12px;
    background: var(--color-background-200);
    border-radius: var(--rounded-md-2);
    font-size: var(--size-14);
    line-height: var(--size-20);
    color: var(--color-gray-900);
  }

  [data-nextjs-error-explanation] p {
    margin: 0;
  }

  [data-nextjs-error-explanation] p + p {
    margin-top: 6px;
  }

  [data-nextjs-guidance-fixes] {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  [data-nextjs-fix-diff] {
    margin: 10px 0 4px;
    padding: 10px 12px;
    background: var(--color-background-100);
    border: 1px solid var(--color-gray-alpha-300);
    border-radius: var(--rounded-md-2);
    font-family: var(--font-stack-monospace);
    font-size: var(--size-13);
    line-height: 1.6;
    overflow-x: auto;
    white-space: pre;
  }

  [data-diff-type='add'] {
    color: var(--color-green-900, #1a7f37);
    background: var(--color-green-100, #dafbe1);
  }

  [data-diff-type='remove'] {
    color: var(--color-red-900, #cf222e);
    background: var(--color-red-100, #ffebe9);
  }

  [data-diff-type='context'] {
    color: var(--color-gray-700);
  }

  a[data-nextjs-guidance-fix-link] {
    display: inline-block;
    margin-top: 8px;
    color: var(--color-blue-900, #0070f3);
    font-size: var(--size-13);
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }
`
