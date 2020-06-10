import React, { ReactNode } from 'react'

type Props = {
  children?: ReactNode
}

const Container: React.FC = ({ children }: Props) => {
  return <div className="container mx-auto px-5">{children}</div>
}

export default Container
