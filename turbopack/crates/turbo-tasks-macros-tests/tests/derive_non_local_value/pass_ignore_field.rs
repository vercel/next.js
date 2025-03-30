use std::marker::PhantomData;

use turbo_tasks::NonLocalValue;

struct UnannotatedValue<T>(PhantomData<T>);

#[derive(NonLocalValue)]
struct ContainsIgnore<T> {
    #[turbo_tasks(trace_ignore)]
    a: UnannotatedValue<T>,
}

fn main() {
    let _ = ContainsIgnore {
        a: UnannotatedValue(PhantomData::<u32>),
    };
}
