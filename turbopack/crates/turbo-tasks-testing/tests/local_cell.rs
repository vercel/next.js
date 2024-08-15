#![feature(arbitrary_self_types)]

use turbo_tasks::{
    debug::ValueDebug, test_helpers::current_task_for_testing, ResolvedValue, ValueDefault, Vc,
};
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

#[turbo_tasks::function(local_cells)]
async fn returns_resolved_local_vc() -> Vc<u32> {
    let cell = Vc::<u32>::cell(42);
    assert!(cell.is_local());
    cell.resolve().await.unwrap()
}

#[tokio::test]
async fn test_return_resolved() {
    run(&REGISTRATION, async {
        assert_eq!(*returns_resolved_local_vc().await.unwrap(), 42);
    })
    .await
}

#[turbo_tasks::value_trait]
trait UnimplementedTrait {}

#[tokio::test]
async fn test_try_resolve_sidecast() {
    run(&REGISTRATION, async {
        let trait_vc: Vc<Box<dyn ValueDebug>> = Vc::upcast(Vc::<u32>::local_cell(42));

        // `u32` is both a `ValueDebug` and a `ValueDefault`, so this sidecast is valid
        let sidecast_vc = Vc::try_resolve_sidecast::<Box<dyn ValueDefault>>(trait_vc)
            .await
            .unwrap();
        assert!(sidecast_vc.is_some());

        // `u32` is not an `UnimplementedTrait` though, so this should return None
        let wrongly_sidecast_vc = Vc::try_resolve_sidecast::<Box<dyn UnimplementedTrait>>(trait_vc)
            .await
            .unwrap();
        assert!(wrongly_sidecast_vc.is_none());
    })
    .await
}

#[tokio::test]
async fn test_try_resolve_downcast_type() {
    run(&REGISTRATION, async {
        let trait_vc: Vc<Box<dyn ValueDebug>> = Vc::upcast(Vc::<u32>::local_cell(42));

        let downcast_vc: Vc<u32> = Vc::try_resolve_downcast_type(trait_vc)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(*downcast_vc.await.unwrap(), 42);

        let wrongly_downcast_vc: Option<Vc<i64>> =
            Vc::try_resolve_downcast_type(trait_vc).await.unwrap();
        assert!(wrongly_downcast_vc.is_none());
    })
    .await
}

#[tokio::test]
async fn test_get_task_id() {
    run(&REGISTRATION, async {
        // the task id as reported by the RawVc
        let vc_task_id = Vc::into_raw(Vc::<()>::local_cell(())).get_task_id();
        assert_eq!(vc_task_id, current_task_for_testing());
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

unsafe impl ResolvedValue for Untracked {}

impl PartialEq for Untracked {
    fn eq(&self, other: &Self) -> bool {
        std::ptr::eq(self as *const _, other as *const _)
    }
}

impl Eq for Untracked {}

#[turbo_tasks::function(local_cells)]
async fn get_untracked_local_cell() -> Vc<Untracked> {
    Untracked { cell: Vc::cell(42) }
        .cell()
        .resolve()
        .await
        .unwrap()
}

#[tokio::test]
#[should_panic(expected = "Local Vcs must only be accessed within their own task")]
async fn test_panics_on_local_cell_escape_read() {
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

#[tokio::test]
#[should_panic(expected = "Local Vcs must only be accessed within their own task")]
async fn test_panics_on_local_cell_escape_get_task_id() {
    run(&REGISTRATION, async {
        Vc::into_raw(get_untracked_local_cell().await.unwrap().cell).get_task_id();
    })
    .await
}
