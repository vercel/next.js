import css from 'styled-jsx/css'

export default css`
  @media (max-width: 870px) {
    :global(th.expiration-date-cell),
    :global(td.expiration-date-cell) {
      display: none;
    }
  }
`
