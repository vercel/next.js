import keep_me from 'hello'
import { keep_me2 } from 'hello2'
import * as keep_me3 from 'hello3'

import drop_me from 'bla'
import { drop_me2 } from 'foo'
import { drop_me3, but_not_me } from 'bar'
import * as remove_mua from 'hehe'

var leave_me_alone = 1
function dont_bug_me_either() {}

const inceptionVar = 'hahaa'
var var1 = 1
let var2 = 2
const var3 = inceptionVar + remove_mua

function inception1() {
  var2
  drop_me2
}

function abc() {}
const b = function () {
  var3
  drop_me3
}
const b2 = function apples() {}
const bla = () => {
  inception1
}

function getStaticProps() {
  abc()
  drop_me
  b
  b2
  bla()
  return { props: { var1 } }
}

export { getStaticProps }

export default function Test() {
  return <div />
}
