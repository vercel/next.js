#![feature(arbitrary_self_types)]

#[turbo_tasks::value(resolved)]
struct MyValue {
    value: i32,
}

fn expects_resolved<T: turbo_tasks::ResolvedValue>(value: T) {}

fn main() {
    let v = MyValue { value: 0 };
    expects_resolved(v);
    let _ = v.value;
}
