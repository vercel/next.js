export default () => (
  <div id='node-env'>{process.env.NODE_ENV}</div>
);

// Just some async function in app code. Depending on how this is transpiled,
// it can cause regenerator to be imported.
(async function () {
  await console.log('hi')
})()
