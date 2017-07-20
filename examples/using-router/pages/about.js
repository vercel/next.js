import Header from '../components/Header'

export default (props) => (
  <div>
    <Header />
    <p>This is the about page.</p>
    <pre>
      {JSON.stringify(props)}
    </pre>
  </div>
)
