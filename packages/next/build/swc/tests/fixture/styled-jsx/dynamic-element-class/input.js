export default class {
  render() {
    const Element = 'div'

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
}

const Element2 = 'div'
export const Test2 = class {
  render() {
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
}
