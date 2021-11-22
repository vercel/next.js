const Test = () => <style global jsx>{'p { color: red }'}</style>

export default () => (
  <div>
    <p>test</p>
    <style jsx global>{`body { background: red }`}</style>
    <style jsx>{'p { color: red }'}</style>
  </div>
)
