#![feature(arbitrary_self_types)]

use turbo_tasks::Vc;
use turbo_tasks_testing::{register, run, Registration};

static REGISTRATION: Registration = register!();

#[turbo_tasks::value]
struct Wrapper(u32);

#[turbo_tasks::value(transparent)]
struct TransparentWrapper(u32);

#[tokio::test]
async fn store_and_read() {
    run(&REGISTRATION, async {
        let a: Vc<u32> = Vc::local_cell(42);
        assert_eq!(*a.await.unwrap(), 42);

        let b = Wrapper(42).local_cell();
        assert_eq!((*b.await.unwrap()).0, 42);

        let c = TransparentWrapper(42).local_cell();
        assert_eq!(*c.await.unwrap(), 42);
    })
    .await
}

#[tokio::test]
async fn store_and_read_generic() {
    run(&REGISTRATION, async {
        // `Vc<Vec<Vc<T>>>` is stored as `Vc<Vec<Vc<()>>>` and requires special
        // transmute handling
        let cells: Vc<Vec<Vc<u32>>> =
            Vc::local_cell(vec![Vc::local_cell(1), Vc::local_cell(2), Vc::cell(3)]);

        let mut output = Vec::new();
        for el in cells.await.unwrap() {
            output.push(*el.await.unwrap());
        }

        assert_eq!(output, vec![1, 2, 3]);
    })
    .await
}
