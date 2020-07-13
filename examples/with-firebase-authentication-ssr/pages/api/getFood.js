// import { verifyIdToken } from 'utils/auth/firebaseAdmin'
const favoriteFoods = ['donuts', 'apples', 'pancakes', 'kale']

const getFood = async (req, res) => {
  // TODO: reenable auth
  // const token = req.headers.token
  // try {
  //   await verifyIdToken(token)
  //   return res.status(200).json({
  //     food: favoriteFoods[Math.floor(Math.random() * favoriteFoods.length)],
  //   })
  // } catch (error) {
  //   return res.status(401).send('Unauthorized.')
  // }
  return res.status(200).json({
    food: favoriteFoods[Math.floor(Math.random() * favoriteFoods.length)],
  })
}

export default getFood
