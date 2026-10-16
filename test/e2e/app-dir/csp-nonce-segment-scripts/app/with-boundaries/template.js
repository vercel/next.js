import { Marker } from './marker'

export default function Template({ children }) {
  return (
    <>
      <Marker id="template" />
      {children}
    </>
  )
}
