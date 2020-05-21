import React from 'react'

type Props = {
  name: string
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void
}

const Button = (props: Props) => {
  return (
    <>
      <style jsx={true}>{`
        button {
          color: #000;
          font-size: 14px;
          cursor: pointer;
          width: fit-content;
          padding: 10px;
          outline: none;
          background: none;
          appearance: none;
          border: 1px solid #999;
        }
        button:hover {
          border: 1px solid #000;
          color: #000;
        }
      `}</style>
      <button onClick={props.onClick}>{props.name}</button>
    </>
  )
}

export default Button
