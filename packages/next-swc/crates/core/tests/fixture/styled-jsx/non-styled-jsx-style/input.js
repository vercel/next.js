export default () => (
  <div>
    <p>woot</p>
    <style dangerouslySetInnerHTML={{ __html: `body { margin: 0; }` }}></style>
    <style jsx>{'p { color: red }'}</style>
  </div>
)
