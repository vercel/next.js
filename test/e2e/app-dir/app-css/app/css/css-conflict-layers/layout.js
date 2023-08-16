import { BlueButton } from './blue-button'

export default function ServerLayout({ children }) {
  return (
    <>
      <div>
        Blue Button: <BlueButton />
      </div>
      {children}
    </>
  )
}
