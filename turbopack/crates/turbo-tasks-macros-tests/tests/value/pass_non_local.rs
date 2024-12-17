#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

#[turbo_tasks::value]
struct MyValue {
    value: i32,
}

fn expects_non_local<T: turbo_tasks::NonLocalValue>(_value: T) {}

fn main() {
    let v = MyValue { value: 0 };
    expects_non_local(v);
    let _ = v.value;
}
