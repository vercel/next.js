import admin from '../firebase/nodeApp'

export const getProfileData = async (username) => {
  const db = admin.firestore()
  const profileCollection = db.collection('profile')
  const profileDoc = await profileCollection.doc(username).get()

  if (!profileDoc.exists) {
    return null
  }

  const profileData = profileDoc.data()
  const profileDataJson = JSON.stringify(profileData)
  return profileDataJson
}
