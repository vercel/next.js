use std::marker::PhantomData;

use turbo_tasks::ResolvedValue;

struct UnannotatedValue<T>(PhantomData<T>);

#[derive(ResolvedValue)]
struct ContainsIgnore<T> {
    #[turbo_tasks(trace_ignore)]
    a: UnannotatedValue<T>,
}

fn main() {
    let _ = ContainsIgnore {
        a: UnannotatedValue(PhantomData::<u32>),
    };
}
