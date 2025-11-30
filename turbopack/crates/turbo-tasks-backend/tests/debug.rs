#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use std::sync::Mutex;

use turbo_tasks::{ResolvedVc, Vc, debug::ValueDebug};
use turbo_tasks_testing::{Registration, register, run_once};

static REGISTRATION: Registration = register!();

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn primitive_debug() {
    run_once(&REGISTRATION, || async {
        let a: Vc<u32> = Vc::cell(42);
        assert_eq!(format!("{:?}", a.dbg().await?), "42");
        anyhow::Ok(())
    })
    .await
    .unwrap()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn transparent_debug() {
    run_once(&REGISTRATION, || async {
        let a: Vc<Transparent> = Transparent(42).cell();
        assert_eq!(format!("{:?}", a.dbg().await?), "42");

        anyhow::Ok(())
    })
    .await
    .unwrap()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn enum_none_debug() {
    run_once(&REGISTRATION, || async {
        let a: Vc<Enum> = Enum::None.cell();
        assert_eq!(format!("{:?}", a.dbg().await?), "Enum :: None");

        anyhow::Ok(())
    })
    .await
    .unwrap()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn enum_transparent_debug() {
    run_once(&REGISTRATION, || async {
        let a: Vc<Enum> = Enum::Transparent(Transparent(42).resolved_cell()).cell();
        assert_eq!(
            format!("{:?}", a.dbg().await?),
            r#"Enum :: Transparent(
    42,
)"#
        );
        anyhow::Ok(())
    })
    .await
    .unwrap()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn enum_inner_vc_debug() {
    run_once(&REGISTRATION, || async {
        let a: Vc<Enum> = Enum::Enum(Enum::None.resolved_cell()).cell();
        assert_eq!(
            format!("{:?}", a.dbg().await?),
            r#"Enum :: Enum(
    Enum :: None,
)"#
        );
        anyhow::Ok(())
    })
    .await
    .unwrap()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn struct_unit_debug() {
    run_once(&REGISTRATION, || async {
        let a: Vc<StructUnit> = StructUnit.cell();
        assert_eq!(format!("{:?}", a.dbg().await?), "StructUnit");
        anyhow::Ok(())
    })
    .await
    .unwrap()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn struct_transparent_debug() {
    run_once(&REGISTRATION, || async {
        let a: Vc<StructWithTransparent> = StructWithTransparent {
            transparent: Transparent(42).resolved_cell(),
        }
        .cell();
        assert_eq!(
            format!("{:?}", a.dbg().await?),
            r#"StructWithTransparent {
    transparent: 42,
}"#
        );
        anyhow::Ok(())
    })
    .await
    .unwrap()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn struct_vec_debug() {
    run_once(&REGISTRATION, || async {
        let a: Vc<StructWithVec> = StructWithVec { vec: vec![] }.cell();
        assert_eq!(
            format!("{:?}", a.dbg().await?),
            r#"StructWithVec {
    vec: [],
}"#
        );

        let b: Vc<StructWithVec> = StructWithVec {
            vec: vec![Transparent(42).resolved_cell()],
        }
        .cell();
        assert_eq!(
            format!("{:?}", b.dbg().await?),
            r#"StructWithVec {
    vec: [
        42,
    ],
}"#
        );
        anyhow::Ok(())
    })
    .await
    .unwrap()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn struct_ignore_debug() {
    run_once(&REGISTRATION, || async {
        let a: Vc<StructWithIgnore> = StructWithIgnore {
            dont_ignore: 42,
            ignore: Mutex::new(()),
        }
        .cell();
        assert_eq!(
            format!("{:?}", a.dbg().await?),
            r#"StructWithIgnore {
    dont_ignore: 42,
}"#
        );
        anyhow::Ok(())
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
