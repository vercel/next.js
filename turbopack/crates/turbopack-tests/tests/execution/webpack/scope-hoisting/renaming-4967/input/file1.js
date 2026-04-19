export function a() {
  return 'ok'
}

export function test() {
  function file1_js_a() {
    return 'fail'
  }
  function file1_a() {
    return 'fail'
  }
  return a()
}

function renaming_4967_file1_js_a() {
  return 'fail'
}
function renaming_4967_file1_a() {
  return 'fail'
}
