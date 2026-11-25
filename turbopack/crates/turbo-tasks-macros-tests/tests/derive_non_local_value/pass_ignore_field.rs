use std::marker::PhantomData;

use turbo_tasks::NonLocalValue;

struct UnannotatedValue<T>(PhantomData<T>);

#[derive(NonLocalValue)]
struct ContainsIgnore<T> {
    #[turbo_tasks(unsafe_ignore)]
    a: UnannotatedValue<T>,
}

fn main() {
    let _ = ContainsIgnore {
        a: UnannotatedValue(PhantomData::<u32>),
    };
}
