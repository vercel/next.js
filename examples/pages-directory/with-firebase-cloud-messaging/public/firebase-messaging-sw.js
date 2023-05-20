/* global importScripts, firebase */
importScripts('https://www.gstatic.com/firebasejs/7.9.1/firebase-app.js')
importScripts('https://www.gstatic.com/firebasejs/7.9.1/firebase-messaging.js')

firebase.initializeApp({
  apiKey: 'YOUR-API-KEY',
  projectId: 'YOUR-PROJECT-ID',
  messagingSenderId: 'YOUR-SENDER-ID',
  appId: 'YOUR-APP-ID',
})

firebase.messaging()
