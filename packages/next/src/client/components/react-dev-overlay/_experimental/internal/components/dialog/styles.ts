import { noop as css } from '../../helpers/noop-template'

const styles = css`
  [data-nextjs-dialog-root] {
    --next-dialog-radius: var(--rounded-xl);
    --next-dialog-footer-height: 48px;
    --next-dialog-max-width: 960px;
    --next-dialog-row-padding: 16px;

    display: flex;
    flex-direction: column-reverse;
    width: 100%;
    max-height: calc(100% - 56px);
    max-width: var(--next-dialog-max-width);
    margin-right: auto;
    margin-left: auto;
    scale: 0.98;
    opacity: 0;
    transition-property: scale, opacity;
    transition-duration: var(--transition-duration);
    transition-timing-function: var(--timing-overlay);

    &[data-rendered='true'] {
      opacity: 1;
      scale: 1;
    }
  }

  [data-nextjs-dialog] {
    outline: none;
  }

  ${
    '' /* Place overflow: hidden on this so we can break out from [data-nextjs-dialog] */
  }
  [data-nextjs-dialog-sizer] {
    overflow: hidden;
    border-radius: inherit;
  }

  [data-nextjs-dialog-backdrop] {
    opacity: 0;
    transition: opacity var(--transition-duration) var(--timing-overlay);
  }

  [data-nextjs-dialog-overlay][data-rendered='true']
    [data-nextjs-dialog-backdrop] {
    opacity: 1;
  }

  [data-nextjs-dialog-content] {
    overflow-y: auto;
    border: none;
    margin: 0;
    display: flex;
    flex-direction: column;
    position: relative;
    padding: var(--size-4) var(--size-3);
  }

  /* Account for the footer height, when present */
  [data-nextjs-dialog][data-has-footer='true'] [data-nextjs-dialog-body] {
    margin-bottom: var(--next-dialog-footer-height);
  }

  [data-nextjs-dialog-content] > [data-nextjs-dialog-header] {
    flex-shrink: 0;
    margin-bottom: var(--size-2);
  }

  [data-nextjs-dialog-content] > [data-nextjs-dialog-body] {
    position: relative;
    flex: 1 1 auto;
  }

  [data-nextjs-dialog-footer] {
    /* Subtract border width */
    width: calc(100% - 2px);
    /* 
      We make this element fixed to anchor it to the bottom during the height transition.
      If you make this relative it will jump during the transition and not collapse or expand smoothly.
      If you make this absolute it will remain stuck at its initial position when scrolling the dialog.
    */
    position: fixed;
    bottom: 1px;
    min-height: var(--next-dialog-footer-height);
    border-radius: 0 0 var(--next-dialog-radius) var(--next-dialog-radius);
    overflow: hidden;

    > * {
      min-height: var(--next-dialog-footer-height);
    }
  }

  @media (max-height: 812px) {
    [data-nextjs-dialog-overlay] {
      max-height: calc(100% - 15px);
    }
  }

  @media (min-width: 576px) {
    [data-nextjs-dialog-root] {
      --next-dialog-max-width: 540px;
    }
  }

  @media (min-width: 768px) {
    [data-nextjs-dialog-root] {
      --next-dialog-max-width: 720px;
    }
  }

  @media (min-width: 992px) {
    [data-nextjs-dialog-root] {
      --next-dialog-max-width: 960px;
    }
  }
`

export { styles }
