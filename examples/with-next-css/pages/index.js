import HelloWorld from '../component/hello-world'

export default () => (
  <div className="example">
    <div className="indexPageDiv">If the style sheet is imported into the _app.js file, it will apply the styling
      to all of you pages using className/id or the element name.
    </div>
    <HelloWorld />
  </div>
)
