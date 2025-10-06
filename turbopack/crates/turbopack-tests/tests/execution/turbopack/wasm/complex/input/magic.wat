(module
  (type $t0 (func (result i32)))
  (type $t1 (func (param i32)))
  (import "./memory.js" "memory" (memory 1))
  (import "./magic-number.js" "getRandomNumber" (func $getRandomNumber (type $t0)))
  (func $get (export "get") (type $t0) (result i32)
    (i32.load
      (i32.const 0)))
  (func $set (export "set") (type $t1) (param $p i32)
    (i32.store
      (i32.const 0)
      (local.get $p)))
  (func $getNumber (export "getNumber") (type $t0) (result i32)
    (call $getRandomNumber))
)
