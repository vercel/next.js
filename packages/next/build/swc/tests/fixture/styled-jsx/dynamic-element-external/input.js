import styles from './styles2'

export default ({ level = 1 }) => {
  const Element = `h${level}`

  return (
    <Element className="root">
      <p>dynamic element</p>
      <style jsx>{styles}</style>
    </Element>
  )
}
