const Sequelize = require('sequelize')

const db = new Sequelize({
  dialect: 'mariadb',
  dialectModule: require('mariadb'),
})
