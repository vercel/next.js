// When browserslist-rs can't resolve the target (e.g. "chrome 99999"),
// preset-env should treat it as `unknown_version` instead of enabling every
// transform. Without the fix this panics: the generator transform has a
// todo!() for **.

async function compute() {
  return 10n ** 18n
}

console.log(compute())

export default 123
