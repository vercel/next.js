import { ViewTransition } from 'react'
import './styles.css'

export default function Layout({ children }) {
  return (
    <ViewTransition default={{ slide: 'slide' }}>
      <div className="page">{children}</div>
    </ViewTransition>
  )
}
