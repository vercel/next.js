#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

#[turbo_tasks::value_trait(resolved)]
trait MyTrait {}

fn expects_resolved<T: turbo_tasks::ResolvedValue + ?Sized>() {}

fn main() {
    expects_resolved::<&dyn MyTrait>();
}
