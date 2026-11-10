const ModuleExportsDefaultTest = require('./module-exports-default').default
const Test1 = require('./exports-default').default
import Test2 from './exports-default'
const Test3 = require('./exports-default-flagged').default
import Test4 from './exports-default-flagged'
const Test5 = require('./exports-default-bailout').default
import Test6 from './exports-default-bailout'
const Test7 = require('./exports-default-bailout-flagged').default
import Test8 from './exports-default-bailout-flagged'
const moduleExportsDefaultTest = new ModuleExportsDefaultTest()
const test1 = new Test1()
const test2 = new Test2.default()
const test3 = new Test3()
const test4 = new Test4()
const test5 = new Test5()
const test6 = new Test6.default()
const test7 = new Test7()
const test8 = new Test8()
export const moduleExportsDefault = moduleExportsDefaultTest.getString()
export const hello1 = test1.getString()
export const hello2 = test2.getString()
export const hello3 = test3.getString()
export const hello4 = test4.getString()
export const hello5 = test5.getString()
export const hello6 = test6.getString()
export const hello7 = test7.getString()
export const hello8 = test8.getString()
