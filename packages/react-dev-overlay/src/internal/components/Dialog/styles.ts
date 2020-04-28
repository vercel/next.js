import { noop as css } from '../../helpers/noop-template'

const styles = css`
  [data-nextjs-dialog] {
    display: flex;
    flex-direction: column;
    width: 100%;
    margin-right: auto;
    margin-left: auto;
    outline: none;
    background: white;
    border-radius: 0.5rem;
    box-shadow: 0 0.25rem 0.5rem rgba(22, 28, 45, 0.5);
    max-height: calc(100% - 3.5rem);
    overflow-y: hidden;
  }

  @media (min-width: 576px) {
    [data-nextjs-dialog] {
      max-width: 540px;
      box-shadow: 0 0.5rem 1rem rgba(22, 28, 45, 0.5);
    }
  }

  @media (min-width: 768px) {
    [data-nextjs-dialog] {
      max-width: 720px;
    }
  }

  @media (min-width: 992px) {
    [data-nextjs-dialog] {
      max-width: 960px;
    }
  }
`

export { styles }
