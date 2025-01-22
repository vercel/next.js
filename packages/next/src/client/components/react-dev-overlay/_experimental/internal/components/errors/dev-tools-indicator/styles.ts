import { noop as css } from '../../../helpers/noop-template'

export const styles = css`
  .menu {
    -webkit-font-smoothing: antialiased;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    background: var(--color-background-100);
    border: 1px solid var(--color-gray-alpha-400);
    background-clip: padding-box;
    box-shadow: var(--shadow-menu);
    border-radius: var(--rounded-xl);
    position: absolute;
    font-family: var(--font-stack-sans);
    bottom: calc(100% + var(--size-gap));
    left: 0;
    z-index: 1000;
    overflow: hidden;
    opacity: 0;
    outline: 0;
    min-width: 248px;
    background: var(--color-background-100);
    transition: opacity var(--animate-out-duration-ms)
      var(--animate-out-timing-function);

    &[data-rendered='true'] {
      opacity: 1;
      scale: 1;
    }
  }

  .inner {
    padding: 6px;
    width: 100%;
  }

  .item {
    display: flex;
    align-items: center;
    padding: 8px 6px;
    height: 36px;
    border-radius: var(--rounded-md);
    text-decoration: none !important;
    user-select: none;

    &:focus-visible {
      outline: 0;
    }
  }

  .footer {
    background: var(--color-background-200);
    padding: 6px;
    border-top: 1px solid var(--color-gray-400);
    width: 100%;
  }

  .item[data-selected='true'] {
    cursor: pointer;
    background-color: var(--color-gray-200);
  }

  .label {
    font-size: var(--size-font-small);
    line-height: var(--size-5);
    color: var(--color-gray-1000);
  }

  .value {
    font-size: var(--size-font-small);
    line-height: var(--size-5);
    color: var(--color-gray-900);
    margin-left: auto;
  }

  .issueCount {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: var(--size-1);
    width: var(--size-5);
    height: var(--size-5);
    background: var(--color-gray-300);
    color: var(--color-gray-1000);
    border-radius: var(--rounded-full);
    font-weight: 500;
    font-size: 11px;
    line-height: var(--size-4);

    &[data-has-issues='true'] {
      background: var(--color-red-300);
      color: var(--color-red-900);
    }
  }

  .shortcut {
    display: flex;
    gap: var(--size-1);

    kbd {
      width: var(--size-5);
      height: var(--size-5);
      display: flex;
      justify-content: center;
      align-items: center;
      border-radius: var(--rounded-md);
      border: 1px solid var(--color-gray-400);
      font-family: var(--font-stack-sans);
      background: var(--color-background-100);
      color: var(--color-gray-1000);
      text-align: center;
      font-size: var(--size-font-smaller);
      line-height: var(--size-4);
    }
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border-width: 0;
  }
`
