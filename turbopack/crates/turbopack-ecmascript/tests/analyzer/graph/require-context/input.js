function importAll(r) {
  return r.keys().map(r);
}

const context = require.context('./test', false, /\.test\.js$/);
const items = importAll(context);

const a = context.resolve("./a");
