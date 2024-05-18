import { ReactNode } from 'react'

type LetterLayoutProps = {
  params: { letter: string }
  children: ReactNode
  grid: ReactNode
  grid2: ReactNode
  grid3: ReactNode
  grid4: ReactNode
  grid5: ReactNode
}

export default function LetterLayout(props: LetterLayoutProps) {
  return (
    <div className="bg-gray-100">
      {props.children}
      <div className="bg-gray-400 p-4">
        {props.grid}
        {props.grid2}
        {props.grid3}
        {props.grid4}
        {props.grid5}
      </div>
    </div>
  )
}
