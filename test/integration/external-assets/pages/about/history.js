import firebase from 'firebase/app'
import 'firebase/firestore'

if (!firebase.apps.length) {
  firebase.initializeApp({ projectId: 'noop' })
}

const store = firebase.firestore()

const Comp = ({ results }) => {
  return <div>Hello Firebase: {results}</div>
}

Comp.getInitialProps = async () => {
  const query = await store.collection('users').get()
  return { results: query.size }
}

export default Comp
