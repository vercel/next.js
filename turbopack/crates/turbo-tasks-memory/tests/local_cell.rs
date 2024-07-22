#![feature(arbitrary_self_types)]

use turbo_tasks::Vc;
use turbo_tasks_testing::{register, run, Registration};

static REGISTRATION: Registration = register!();

#[turbo_tasks::value]
struct Wrapper(u32);

#[turbo_tasks::value(transparent)]
struct TransparentWrapper(u32);

#[tokio::test]
async fn test_store_and_read() {
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
async fn test_store_and_read_generic() {
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

#[turbo_tasks::function]
async fn returns_resolved_local_vc() -> Vc<u32> {
    Vc::<u32>::local_cell(42).resolve().await.unwrap()
}

#[tokio::test]
async fn test_return_resolved() {
    run(&REGISTRATION, async {
        assert_eq!(*returns_resolved_local_vc().await.unwrap(), 42);
    })
    .await
}

#[turbo_tasks::value(eq = "manual")]
#[derive(Default)]
struct Untracked {
    #[turbo_tasks(debug_ignore, trace_ignore)]
    #[serde(skip)]
    cell: Vc<u32>,
}

impl PartialEq for Untracked {
    fn eq(&self, other: &Self) -> bool {
        std::ptr::eq(self as *const _, other as *const _)
    }
}

impl Eq for Untracked {}

#[turbo_tasks::function]
async fn get_untracked_local_cell() -> Vc<Untracked> {
    Untracked {
        cell: Vc::local_cell(42),
    }
    .cell()
}

#[tokio::test]
#[should_panic(expected = "Local Vcs must only be accessed within their own task")]
async fn test_panics_on_local_cell_escape() {
    run(&REGISTRATION, async {
        get_untracked_local_cell()
            .await
            .unwrap()
            .cell
            .await
            .unwrap();
    })
    .await
}
