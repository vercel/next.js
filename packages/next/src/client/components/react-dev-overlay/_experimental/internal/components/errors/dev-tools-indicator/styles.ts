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
    border-radius: 6px;
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
    --color-primary: var(--color-gray-800);
    --color-secondary: var(--color-gray-100);
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-width: 41px;
    height: 24px;
    background: var(--color-background-100);
    border: 1px solid var(--color-gray-alpha-400);
    background-clip: padding-box;
    box-shadow: var(--shadow-small);
    padding: 2px;
    color: var(--color-gray-1000);
    border-radius: 128px;
    font-weight: 500;
    font-size: 13px;
    font-variant-numeric: tabular-nums;

    &[data-has-issues='true'] {
      --color-primary: var(--color-red-800);
      --color-secondary: var(--color-red-100);
    }

    .indicator {
      width: 8px;
      height: 8px;
      background: var(--color-primary);
      box-shadow: 0 0 0 2px var(--color-secondary);
      border-radius: 50%;
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
`
