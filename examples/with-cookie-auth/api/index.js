// const micro = require("micro");
// const routes = require("./routes");

// const PORT = process.env.PORT || 3000;

// const server = micro(routes);
// server.listen(PORT, () => console.log(`Listening on port ${PORT}`));

const { send } = require('micro')

const index = async (req, res) => {
  send(res, 200, '<h1>Hello from Express on Now 2.0!</h2>')
}

module.exports = index
