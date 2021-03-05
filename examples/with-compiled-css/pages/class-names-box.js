import { ClassNames } from '@compiled/react'

export const BoxStyles = ({ children }) => (
  <ClassNames>
    {({ css }) =>
      children({
        className: css`
          display: flex;
          width: 100px;
          height: 100px;
          border: 1px solid red;
          padding: 8px;
          flex-direction: column;
        `,
      })
    }
  </ClassNames>
)
