require.context("./grandparent", true, /\.js/)

// TODO: Ensure that `require.context` matches the Webpack implmentation with no filter
// Make sure this also gets added to the e2e test to ensure it matches for all supported bundlers
// <project-root>/test/e2e/app-dir/require-context/
//
// require.context("./grandparent", true)
