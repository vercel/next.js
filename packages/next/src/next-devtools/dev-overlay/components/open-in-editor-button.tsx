import type { ButtonHTMLAttributes } from 'react'
import { CodeIcon } from '../icons/code'

export function OpenInEditorButton(
  props: ButtonHTMLAttributes<HTMLButtonElement>
) {
  return (
    <button
      type="button"
      {...props}
      aria-label={props['aria-label'] ?? 'Open in Editor'}
      className="open-in-editor-button"
    >
      <CodeIcon aria-hidden="true" />
      <span className="open-in-editor-button-label">Open in Editor</span>
    </button>
  )
}

export const OPEN_IN_EDITOR_BUTTON_STYLES = `
  .open-in-editor-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    gap: 6px;
    height: var(--size-28);
    padding: 0 10px;
    border: 1px solid var(--color-gray-400);
    border-radius: var(--rounded-lg);
    color: var(--color-gray-1000);
    background: var(--color-background-100);
    font-family: var(--font-stack-sans);
    font-size: var(--size-12);
    font-weight: 500;
    line-height: var(--size-16);
    white-space: nowrap;
    cursor: pointer;

    svg {
      width: var(--size-12);
      height: var(--size-12);
    }

    &:focus-visible {
      outline: var(--focus-ring);
      outline-offset: 2px;
    }

    &:hover {
      background: var(--color-gray-alpha-100);
    }

    &:active {
      background: var(--color-gray-alpha-200);
    }
  }

  @media (max-width: 767px) {
    .open-in-editor-button {
      width: var(--size-28);
      padding: 0;
      gap: 0;
    }

    .open-in-editor-button-label {
      display: none;
    }
  }
`
