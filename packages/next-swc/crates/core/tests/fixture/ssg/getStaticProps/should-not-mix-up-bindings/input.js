function Function1() {
  return {
    a: function bug(a) {
      return 2
    },
  }
}

function Function2() {
  var bug = 1
  return { bug }
}

export { getStaticProps } from 'a'
