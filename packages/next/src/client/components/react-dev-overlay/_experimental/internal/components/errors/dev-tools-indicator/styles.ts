import { noop as css } from '../../../helpers/noop-template'

export const styles = css`
  [data-nextjs-toast-wrapper] {
    border: none;
  }

  [data-nextjs-dev-tools-button] {
    border: none;
    background: none;
    padding: 0;
    font-size: var(--size-font);
    cursor: pointer;
  }

  [data-nextjs-dev-tools-popover] {
    -webkit-font-smoothing: antialiased;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding: 0px;
    background: var(--color-background-100);
    border: 1px solid var(--color-gray-alpha-400);
    background-clip: padding-box;
    box-shadow: var(--shadow-menu);
    border-radius: var(--rounded-xl);
    position: absolute;
    bottom: calc(100% + var(--size-gap));
    left: 0;
    z-index: 1000;
    overflow: hidden;
    opacity: 0;
    transition: opacity var(--animate-out-duration-ms)
      var(--animate-out-timing-function);

    &[data-rendered='true'] {
      opacity: 1;
      scale: 1;
    }
  }

  [data-nextjs-dev-tools-content] {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding: var(--size-1_5);
    background: var(--color-background-100);
  }

  [data-nextjs-dev-tools-footer] {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding: var(--size-1_5);
    gap: var(--size-2_5);
    background: var(--color-background-200);
    border-top: 1px solid var(--color-gray-200);
    width: 100%;
  }

  [data-nextjs-dev-tools-footer-text] {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding: var(--size-2) var(--size-1_5);
    width: 248px;
  }

  [data-nextjs-dev-tools-version] {
    margin: 0;
    font-family: var(--font-stack-monospace);
    font-style: normal;
    font-weight: 400;
    font-size: 11px;
    line-height: var(--size-4);
    color: var(--color-gray-900);
  }

  [data-nextjs-dev-tools-row] {
    display: flex;
    flex-direction: row;
    align-items: center;
    padding: var(--size-2) var(--size-1_5);
    gap: var(--size-2);
    width: 248px;
    height: 36px;
    border-radius: var(--rounded-md);
    cursor: pointer;
  }

  [data-nextjs-dev-tools-row]:hover {
    background-color: var(--color-gray-100);
  }

  [data-nextjs-dev-tools-row-label] {
    font-family: var(--font-stack-sans);
    font-style: normal;
    font-weight: 400;
    font-size: var(--size-font-small);
    line-height: var(--size-5);
    color: var(--color-gray-1000);
  }

  [data-nextjs-dev-tools-row-value] {
    font-family: var(--font-stack-sans);
    font-weight: 400;
    font-size: var(--size-font-small);
    line-height: var(--size-5);
    color: var(--color-gray-900);
    margin-left: auto;
    padding: 0 var(--size-0_5);
  }

  [data-nextjs-dev-tools-issue-count] {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: var(--size-1);
    width: var(--size-5);
    height: var(--size-5);
    border-radius: var(--rounded-full);
  }

  [data-nextjs-dev-tools-issue-text] {
    font-family: var(--font-stack-sans);
    font-weight: 500;
    font-size: 11px;
    line-height: var(--size-4);
    text-align: center;
  }

  [data-nextjs-dev-tools-issue-count][data-has-issues='true'] {
    background: var(--color-red-300);
  }

  [data-nextjs-dev-tools-issue-count][data-has-issues='false'] {
    background: var(--color-gray-300);
  }

  [data-nextjs-dev-tools-issue-text][data-has-issues='true'] {
    color: var(--color-red-900);
  }

  [data-nextjs-dev-tools-issue-text][data-has-issues='false'] {
    color: var(--color-gray-1000);
  }

  [data-nextjs-dev-tools-container] {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    background: var(--color-background-100);
  }

  [data-nextjs-dev-tools-shortcut-group] {
    display: flex;
    align-items: flex-start;
    gap: var(--size-1);
  }

  [data-nextjs-dev-tools-icon] {
    display: flex;
    width: var(--size-5);
    height: var(--size-5);
    justify-content: center;
    align-items: center;
    border-radius: var(--rounded-md);
    border: 1px solid var(--color-gray-400);
    background: var(--color-background-100);
    color: var(--color-gray-1000);
    text-align: center;
    font-size: var(--size-font-smaller);
    font-style: normal;
    font-weight: 400;
    line-height: var(--size-4);
  }

  [data-nextjs-dev-tools-ctrl-icon] {
    width: 100%;
  }
`
