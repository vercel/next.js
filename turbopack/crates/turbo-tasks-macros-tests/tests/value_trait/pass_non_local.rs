#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![feature(ptr_metadata)]

#[turbo_tasks::value_trait]
trait MyTrait {}

fn expects_non_local<T: turbo_tasks::NonLocalValue + ?Sized>() {}

fn main() {
    expects_non_local::<&dyn MyTrait>();
}
