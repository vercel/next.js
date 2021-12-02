export default ({ level = 1 }) => {
  const Element = `h${level}`

  return (
    <Element className="root">
      <p>dynamic element</p>
      <style jsx>{`
        .root {
          background: red;
        }
      `}</style>
    </Element>
  )
}

export const TestLowerCase = ({ level = 1 }) => {
  const element = `h${level}`

  return (
    <element className="root">
      <p>dynamic element</p>
      <style jsx>{`
        .root {
          background: red;
        }
      `}</style>
    </element>
  )
}

const Element2 = 'div'
export const Test2 = () => {
  return (
    <Element2 className="root">
      <p>dynamic element</p>
      <style jsx>{`
        .root {
          background: red;
        }
      `}</style>
    </Element2>
  )
}

export const Test3 = ({Component = 'div'}) => {
  return (
    <Component>
      <p>dynamic element</p>
        <style jsx>{`
          .root {
            background: red;
          }
        `}</style>
    </Component>
  );
}
