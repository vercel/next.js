import { css } from '../../utils/css'

export function Collapsible({
  title,
  children,
  defaultOpen = false,
}: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  return (
    <details data-nextjs-collapsible open={defaultOpen || undefined}>
      <summary data-nextjs-collapsible-trigger>{title}</summary>
      <div data-nextjs-collapsible-content>{children}</div>
    </details>
  )
}

export const COLLAPSIBLE_STYLES = css`
  [data-nextjs-collapsible] {
    border: 1px solid var(--color-gray-alpha-400);
    border-radius: var(--rounded-md-2);
    overflow: hidden;
  }

  [data-nextjs-collapsible-trigger] {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 10px 12px;
    color: var(--color-gray-900);
    font-size: var(--size-14);
    font-weight: 500;
    line-height: var(--size-20);
    cursor: pointer;
    background: var(--color-background-200);
    transition: background 150ms ease;
    box-sizing: border-box;
    list-style: none;

    &::-webkit-details-marker {
      display: none;
    }

    &::marker {
      display: none;
      content: '';
    }

    &::before {
      content: '▶';
      font-size: 10px;
      transition: transform 150ms ease;
      flex-shrink: 0;
    }

    &:hover {
      background: var(--color-gray-200);
    }

    &:focus-visible {
      outline: var(--focus-ring);
    }
  }

  [data-nextjs-collapsible][open] > [data-nextjs-collapsible-trigger]::before {
    transform: rotate(90deg);
  }

  [data-nextjs-collapsible-content] {
    padding: 8px 12px 12px;
    color: var(--color-gray-900);
    font-size: var(--size-14);
    line-height: var(--size-20);
  }
`
