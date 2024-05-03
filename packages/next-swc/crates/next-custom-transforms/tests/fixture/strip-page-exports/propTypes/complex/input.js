import { PropTypes } from 'react'

export default function Page() {
  return <div />
}

const propTypes = identity(
  (Page.propTypes = {
    prop: PropTypes.bool,
  })
)
