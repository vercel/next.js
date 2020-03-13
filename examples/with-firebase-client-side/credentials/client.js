// TODO: Fill in with your credentials
const productionCredentials = {
  apiKey: '',
  authDomain: '<PROJECT_ID>.firebaseapp.com',
  databaseURL: 'https://<PROJECT_ID>.firebaseio.com',
  projectId: '<PROJECT_ID>',
  storageBucket: '<PROJECT_ID>.appspot.com',
  messagingSenderId: '',
  appId: '',
}

export default productionCredentials

// If you have a staging project, you can do something like the following:
// const stagingCredentials = {
//     apiKey: '',
//     authDomain: '<PROJECT_ID>.firebaseapp.com',
//     databaseURL: 'https://<PROJECT_ID>.firebaseio.com',
//     projectId: '<PROJECT_ID>',
//     storageBucket: '<PROJECT_ID>.appspot.com',
//     messagingSenderId: '',
//     appId: '',
// }

// let credentials = productionCredentials
// if (process.env.NODE_ENV !== 'production') credentials = stagingCredentials

// export default credentials
