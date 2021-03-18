import { Head } from 'next/document'

export default class Test extends Head {
  render() {
    return (
      <div>
        <h1>Hello title</h1>
        <script src="https://synchronous-script.com"></script>
        <link href="/_next/static/css/styles.css" rel="stylesheet" />
      </div>
    )
  }
}
