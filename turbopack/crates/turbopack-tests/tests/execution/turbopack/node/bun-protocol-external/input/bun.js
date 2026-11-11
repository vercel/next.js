// Test that Bun builtins are treated as external
import bunFfi from 'bun:ffi'
import bunJsc from 'bun:jsc'
import bunSqlite from 'bun:sqlite'
import bunTest from 'bun:test'
import bunWrap from 'bun:wrap'
import bun from 'bun'

console.log('bun:ffi:', bunFfi)
console.log('bun:jsc:', bunJsc)
console.log('bun:sqlite:', bunSqlite)
console.log('bun:test:', bunTest)
console.log('bun:wrap:', bunWrap)
console.log('bun:', bun)
