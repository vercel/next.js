import keep_me from 'hello'
import { keep_me2 } from 'hello2'
import * as keep_me3 from 'hello3'

import data_only1 from 'data_only1'
import { data_only2 } from 'data_only2'
import { data_only3, shared4 } from 'shared4'
import * as data_only4 from 'data_only4'

import default_only1 from 'default_only1'
import { default_only2 } from 'default_only2'
import { default_only3, shared5 } from 'shared5'
import * as default_only4 from 'default_only4'

var leave_me_alone = 1
function dont_bug_me_either() {}

const data_inception = 'hahaa'

var data_var1 = 1
let data_var2 = 2
const data_var3 = data_inception + data_only4

function data_inception1() {
  data_var2
  data_only2
}

function data_abc() {}
const data_b = function () {
  data_var3
  data_only3
}
const data_b2 = function data_apples() {}
const data_bla = () => {
  data_inception1
}

function getStaticProps() {
  data_abc()
  data_only1
  data_b
  data_b2
  data_bla()
  return { props: { data_var1 } }
}

export { getStaticProps }

const default_inception = 'hahaa'

var default_var1 = 1
let default_var2 = 2
const default_var3 = default_inception + default_only4

function default_inception1() {
  default_var2
  default_only2
}

function default_abc() {}
const default_b = function () {
  default_var3
  default_only3
}
const default_b2 = function default_apples() {}
const default_bla = () => {
  default_inception1
}

export default function Test() {
  default_abc()
  default_only1
  default_b
  default_b2
  default_bla()
  const props = { default_var1 }
  return <div />
}
