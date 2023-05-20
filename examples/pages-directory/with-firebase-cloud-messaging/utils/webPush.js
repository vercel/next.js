import 'firebase/messaging'
import firebase from 'firebase/app'
import localforage from 'localforage'

const firebaseCloudMessaging = {
  tokenInlocalforage: async () => {
    return localforage.getItem('fcm_token')
  },

  init: async function () {
    firebase.initializeApp({
      apiKey: 'YOUR-API-KEY',
      projectId: 'YOUR-PROJECT-ID',
      messagingSenderId: 'YOUR-SENDER-ID',
      appId: 'YOUR-APP-ID',
    })

    try {
      if ((await this.tokenInlocalforage()) !== null) {
        return false
      }

      const messaging = firebase.messaging()
      await Notification.requestPermission()
      const token = await messaging.getToken()

      localforage.setItem('fcm_token', token)
      console.log('fcm_token', token)
    } catch (error) {
      console.error(error)
    }
  },
}

export { firebaseCloudMessaging }
