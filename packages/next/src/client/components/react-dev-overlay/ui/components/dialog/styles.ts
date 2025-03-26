const styles = `
  [data-nextjs-dialog-root] {
    --next-dialog-radius: var(--rounded-xl);
    --next-dialog-max-width: 960px;
    --next-dialog-row-padding: 16px;
    --next-dialog-padding-x: 12px;
    --next-dialog-notch-height: 42px;
    --next-dialog-border-width: 1px;

    display: flex;
    flex-direction: column;
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

    [data-nextjs-scroll-fader][data-side="top"] {
      left: 1px;
      top: calc(var(--next-dialog-notch-height) + var(--next-dialog-border-width));
      width: calc(100% - var(--next-dialog-padding-x));
      opacity: 0;
    }
  }

  [data-nextjs-dialog] {
    outline: 0;
  }

  [data-nextjs-dialog]::-webkit-scrollbar {
    width: 6px;
    border-radius: 0 0 1rem 1rem;
    margin-bottom: 1rem;
  }

  [data-nextjs-dialog]::-webkit-scrollbar-button {
    display: none;
  }

  [data-nextjs-dialog]::-webkit-scrollbar-track {
    border-radius: 0 0 1rem 1rem;
    background-color: var(--color-background-100);
  }
    
  [data-nextjs-dialog]::-webkit-scrollbar-thumb {
    border-radius: 1rem;
    background-color: var(--color-gray-500);
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
    border: none;
    margin: 0;
    display: flex;
    flex-direction: column;
    position: relative;
    padding: 16px var(--next-dialog-padding-x);
  }

  [data-nextjs-dialog-content] > [data-nextjs-dialog-header] {
    flex-shrink: 0;
    margin-bottom: 8px;
  }

  [data-nextjs-dialog-content] > [data-nextjs-dialog-body] {
    position: relative;
    flex: 1 1 auto;
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
