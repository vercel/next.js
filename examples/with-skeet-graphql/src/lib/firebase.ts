import firebaseConfig from '@lib/firebaseConfig'
import { initializeApp, getApp, getApps } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { getStorage, connectStorageEmulator } from 'firebase/storage'
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore'

export const firebaseApp = !getApps().length
  ? initializeApp(firebaseConfig)
  : getApp()

const getFirebaseAuth = () => {
  const firebaseAuth = getAuth(firebaseApp)
  if (process.env.NODE_ENV !== 'production') {
    connectAuthEmulator(firebaseAuth, 'http://127.0.0.1:9099', {
      disableWarnings: true,
    })
  }
  return firebaseAuth
}

export const auth = firebaseApp ? getFirebaseAuth() : undefined

const getFirebaseStorage = () => {
  const firebaseStorage = getStorage(firebaseApp)
  if (process.env.NODE_ENV !== 'production') {
    connectStorageEmulator(firebaseStorage, '127.0.0.1', 9199)
  }
  return firebaseStorage
}

export const storage = firebaseApp ? getFirebaseStorage() : undefined

const getFirebaseFirestore = () => {
  const firestoreDb = getFirestore(firebaseApp)
  if (process.env.NODE_ENV !== 'production') {
    connectFirestoreEmulator(firestoreDb, '127.0.0.1', 8080)
  }
  return firestoreDb
}

export const db = firebaseApp ? getFirebaseFirestore() : undefined
