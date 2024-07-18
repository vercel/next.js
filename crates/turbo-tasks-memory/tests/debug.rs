#![feature(arbitrary_self_types)]

use std::sync::Mutex;

use turbo_tasks::{debug::ValueDebug, Vc};
use turbo_tasks_testing::{register, run};

register!();

#[tokio::test]
async fn primitive_debug() {
    run! {
        let a: Vc<u32> = Vc::cell(42);
        assert_eq!(format!("{:?}", a.dbg().await?), "42");
    }
}

#[tokio::test]
async fn transparent_debug() {
    run! {
        let a: Vc<Transparent> = Transparent(42).cell();
        assert_eq!(format!("{:?}", a.dbg().await?), "42");
    }
}

#[tokio::test]
async fn enum_none_debug() {
    run! {
        let a: Vc<Enum> = Enum::None.cell();
        assert_eq!(format!("{:?}", a.dbg().await?), "Enum::None");
    }
}

#[tokio::test]
async fn enum_transparent_debug() {
    run! {
        let a: Vc<Enum> = Enum::Transparent(Transparent(42).cell()).cell();
        assert_eq!(format!("{:?}", a.dbg().await?), r#"Enum::Transparent(
    42,
)"#);
    }
}

#[tokio::test]
async fn enum_inner_vc_debug() {
    run! {
        let a: Vc<Enum> = Enum::Enum(Enum::None.cell()).cell();
        assert_eq!(format!("{:?}", a.dbg().await?), r#"Enum::Enum(
    Enum::None,
)"#);
    }
}

#[tokio::test]
async fn struct_unit_debug() {
    run! {
        let a: Vc<StructUnit> = StructUnit.cell();
        assert_eq!(format!("{:?}", a.dbg().await?), "StructUnit");
    }
}

#[tokio::test]
async fn struct_transparent_debug() {
    run! {
        let a: Vc<StructWithTransparent> = StructWithTransparent { transparent: Transparent(42).cell() }.cell();
        assert_eq!(format!("{:?}", a.dbg().await?), r#"StructWithTransparent {
    transparent: 42,
}"#);
    }
}

#[tokio::test]
async fn struct_vec_debug() {
    run! {
        let a: Vc<StructWithVec> = StructWithVec { vec: vec![] }.cell();
        assert_eq!(format!("{:?}", a.dbg().await?), r#"StructWithVec {
    vec: [],
}"#);

        let b: Vc<StructWithVec> = StructWithVec { vec: vec![Transparent(42).cell()] }.cell();
        assert_eq!(format!("{:?}", b.dbg().await?), r#"StructWithVec {
    vec: [
        42,
    ],
}"#);
    }
}

#[tokio::test]
async fn struct_ignore_debug() {
    run! {
        let a: Vc<StructWithIgnore> = StructWithIgnore { dont_ignore: 42, ignore: Mutex::new(()) }.cell();
        assert_eq!(format!("{:?}", a.dbg().await?), r#"StructWithIgnore {
    dont_ignore: 42,
}"#);
    }
}

#[turbo_tasks::value(transparent, shared)]
struct Transparent(u32);

// Allow Enum::Enum
#[allow(clippy::enum_variant_names)]
#[turbo_tasks::value(shared)]
enum Enum {
    None,
    Transparent(Vc<Transparent>),
    Enum(Vc<Enum>),
}

#[turbo_tasks::value(shared)]
struct StructUnit;

#[turbo_tasks::value(shared)]
struct StructWithTransparent {
    transparent: Vc<Transparent>,
}

#[turbo_tasks::value(shared)]
struct StructWithOption {
    option: Option<Vc<Transparent>>,
}

#[turbo_tasks::value(shared)]
struct StructWithVec {
    vec: Vec<Vc<Transparent>>,
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
