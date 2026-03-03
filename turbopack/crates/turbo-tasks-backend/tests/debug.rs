#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use std::sync::Mutex;

use turbo_tasks::{
    ResolvedVc, Vc,
    debug::{ValueDebug, ValueDebugString},
};
use turbo_tasks_testing::{Registration, register, run_once};

static REGISTRATION: Registration = register!();

#[turbo_tasks::function(operation)]
fn dbg_operation(value: ResolvedVc<Box<dyn ValueDebug>>) -> Vc<ValueDebugString> {
    value.dbg()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_primitive_debug() {
    run_once(&REGISTRATION, move || async move {
        let a = ResolvedVc::<u32>::cell(42);
        assert_eq!(
            format!(
                "{:?}",
                dbg_operation(ResolvedVc::upcast(a))
                    .read_strongly_consistent()
                    .await?,
            ),
            "42",
        );
        Ok(())
    })
    .await
    .unwrap()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_transparent_debug() {
    run_once(&REGISTRATION, move || async move {
        let a = Transparent(42).resolved_cell();
        assert_eq!(
            format!(
                "{:?}",
                dbg_operation(ResolvedVc::upcast(a))
                    .read_strongly_consistent()
                    .await?,
            ),
            "42",
        );
        Ok(())
    })
    .await
    .unwrap()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_enum_none_debug() {
    run_once(&REGISTRATION, move || async move {
        let a = Enum::None.resolved_cell();
        assert_eq!(
            format!(
                "{:?}",
                dbg_operation(ResolvedVc::upcast(a))
                    .read_strongly_consistent()
                    .await?,
            ),
            "Enum :: None",
        );
        Ok(())
    })
    .await
    .unwrap()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_enum_transparent_debug() {
    run_once(&REGISTRATION, move || async move {
        let a = Enum::Transparent(Transparent(42).resolved_cell()).resolved_cell();
        assert_eq!(
            format!(
                "{:?}",
                dbg_operation(ResolvedVc::upcast(a))
                    .read_strongly_consistent()
                    .await?,
            ),
            "Enum :: Transparent(\n    42,\n)",
        );
        Ok(())
    })
    .await
    .unwrap()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_enum_inner_vc_debug() {
    run_once(&REGISTRATION, move || async move {
        let a = Enum::Enum(Enum::None.resolved_cell()).resolved_cell();
        assert_eq!(
            format!(
                "{:?}",
                dbg_operation(ResolvedVc::upcast(a))
                    .read_strongly_consistent()
                    .await?,
            ),
            "Enum :: Enum(\n    Enum :: None,\n)",
        );
        Ok(())
    })
    .await
    .unwrap()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_struct_unit_debug() {
    run_once(&REGISTRATION, move || async move {
        let a = StructUnit.resolved_cell();
        assert_eq!(
            format!(
                "{:?}",
                dbg_operation(ResolvedVc::upcast(a))
                    .read_strongly_consistent()
                    .await?,
            ),
            "StructUnit",
        );
        Ok(())
    })
    .await
    .unwrap()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_struct_transparent_debug() {
    run_once(&REGISTRATION, move || async move {
        let a = StructWithTransparent {
            transparent: Transparent(42).resolved_cell(),
        }
        .resolved_cell();
        assert_eq!(
            format!(
                "{:?}",
                dbg_operation(ResolvedVc::upcast(a))
                    .read_strongly_consistent()
                    .await?,
            ),
            "StructWithTransparent {\n    transparent: 42,\n}",
        );
        Ok(())
    })
    .await
    .unwrap()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_struct_option_debug() {
    run_once(&REGISTRATION, || async {
        let a = StructWithOption { option: None }.resolved_cell();
        assert_eq!(
            format!(
                "{:?}",
                dbg_operation(ResolvedVc::upcast(a))
                    .read_strongly_consistent()
                    .await?,
            ),
            "StructWithOption {\n    option: None,\n}",
        );

        let b = StructWithOption {
            option: Some(Transparent(42).resolved_cell()),
        }
        .resolved_cell();
        assert_eq!(
            format!(
                "{:?}",
                dbg_operation(ResolvedVc::upcast(b))
                    .read_strongly_consistent()
                    .await?,
            ),
            "StructWithOption {\n    option: Some(\n        42,\n    ),\n}",
        );

        Ok(())
    })
    .await
    .unwrap()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_struct_vec_debug() {
    run_once(&REGISTRATION, || async {
        let a = StructWithVec { vec: Vec::new() }.resolved_cell();
        assert_eq!(
            format!(
                "{:?}",
                dbg_operation(ResolvedVc::upcast(a))
                    .read_strongly_consistent()
                    .await?,
            ),
            "StructWithVec {\n    vec: [],\n}"
        );

        let b = StructWithVec {
            vec: vec![Transparent(42).resolved_cell()],
        }
        .resolved_cell();
        assert_eq!(
            format!(
                "{:?}",
                dbg_operation(ResolvedVc::upcast(b))
                    .read_strongly_consistent()
                    .await?,
            ),
            "StructWithVec {\n    vec: [\n        42,\n    ],\n}",
        );

        Ok(())
    })
    .await
    .unwrap()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_struct_ignore_debug() {
    run_once(&REGISTRATION, || async {
        let a = StructWithIgnore {
            dont_ignore: 42,
            ignore: Mutex::new(()),
        }
        .resolved_cell();
        assert_eq!(
            format!(
                "{:?}",
                dbg_operation(ResolvedVc::upcast(a))
                    .read_strongly_consistent()
                    .await?,
            ),
            "StructWithIgnore {\n    dont_ignore: 42,\n}",
        );
        Ok(())
    })
    .await
    .unwrap()
}

#[turbo_tasks::value(transparent, shared)]
struct Transparent(u32);

// Allow Enum::Enum
#[allow(clippy::enum_variant_names)]
#[turbo_tasks::value(shared)]
enum Enum {
    None,
    Transparent(ResolvedVc<Transparent>),
    Enum(ResolvedVc<Enum>),
}

#[turbo_tasks::value(shared)]
struct StructUnit;

#[turbo_tasks::value(shared)]
struct StructWithTransparent {
    transparent: ResolvedVc<Transparent>,
}

#[turbo_tasks::value(shared)]
struct StructWithOption {
    option: Option<ResolvedVc<Transparent>>,
}

#[turbo_tasks::value(shared)]
struct StructWithVec {
    vec: Vec<ResolvedVc<Transparent>>,
}

#[turbo_tasks::value(shared, eq = "manual")]
struct StructWithIgnore {
    dont_ignore: u32,
    // We're using a `Mutex` instead of a `T: Debug` type to ensure we support `T: !Debug`.
    #[turbo_tasks(debug_ignore, trace_ignore)]
    ignore: Mutex<()>,
}

impl PartialEq for StructWithIgnore {
    fn eq(&self, other: &Self) -> bool {
        self.dont_ignore == other.dont_ignore
    }
}

impl Eq for StructWithIgnore {}
