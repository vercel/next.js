const styles = `
  .nextjs-toast {
    position: fixed;
    max-width: 420px;
    z-index: 9000;
    box-shadow: 0px 16px 32px
      rgba(0, 0, 0, 0.25);
  }

  .nextjs-toast-errors-parent {
    padding: 16px;
    border-radius: var(--rounded-4xl);
    font-weight: 500;
    color: var(--color-ansi-bright-white);
    background-color: var(--color-ansi-red);
  }
`

export { styles }
