import firebase from "firebase/app";
import "firebase/database";
import "firebase/auth";
import "firebase/firestore";

const config = {
  apiKey: process.env.FIRE_API_KEY,
  authDomain: process.env.FIRE_AUTH_DOMAIN,
  databaseURL: process.env.FIRE_DB_URL,
  projectId: process.env.FIRE_PROJECT_ID,
  storageBucket: process.env.FIRE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIRE_MSG_SENDER_ID,
  appId: process.env.FIRE_APP_ID
};

export default () => {
  if (!firebase.apps.length) {
    firebase.initializeApp(config);
  }

  return {
    firebaseApp: firebase,
    firebaseDB: firebase.firestore(),
    firebaseAuth: firebase.auth(),
    providers: {
      google: new firebase.auth.GoogleAuthProvider()
    }
  };
};
