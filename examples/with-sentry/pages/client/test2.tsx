// This code will run just fine on the server in Node.js, but process will be
// undefined in a browser. Note that `isProd = process.env.NODE_ENV` would have
// worked because Webpack's DefinePlugin will replace it with a string at build
// time
const env = process.env;
const isProd = env.NODE_ENV === "production";

const Test2 = () => (
  <>
    <h1>Client Test 2</h1>
    <p>isProd: {isProd}</p>
  </>
);

export default Test2;
