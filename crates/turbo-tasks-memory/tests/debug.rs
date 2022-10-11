#![feature(min_specialization)]

use std::sync::Mutex;

use anyhow::Result;
use turbo_tasks::debug::ValueDebug;
use turbo_tasks_testing::{register, run};

register!();

#[tokio::test]
async fn transparent_debug() {
    run! {
        let a: TransparentVc = Transparent(42).into();
        assert_eq!(format!("{:?}", a.dbg().await?), "42");
    }
}

#[tokio::test]
async fn enum_none_debug() {
    run! {
        let a: EnumVc = Enum::None.into();
        assert_eq!(format!("{:?}", a.dbg().await?), "None");
    }
}

#[tokio::test]
async fn enum_transparent_debug() {
    run! {
        let a: EnumVc = Enum::Transparent(Transparent(42).into()).into();
        assert_eq!(format!("{:?}", a.dbg().await?), r#"Transparent(
    42,
)"#);
    }
}

#[tokio::test]
async fn enum_inner_vc_debug() {
    run! {
        let a: EnumVc = Enum::Enum(Enum::None.into()).into();
        assert_eq!(format!("{:?}", a.dbg().await?), r#"Enum(
    None,
)"#);
    }
}

#[tokio::test]
async fn struct_unit_debug() {
    run! {
        let a: StructUnitVc = StructUnit.into();
        assert_eq!(format!("{:?}", a.dbg().await?), "StructUnit");
    }
}

#[tokio::test]
async fn struct_transparent_debug() {
    run! {
        let a: StructWithTransparentVc = StructWithTransparent { transparent: Transparent(42).into() }.into();
        assert_eq!(format!("{:?}", a.dbg().await?), r#"StructWithTransparent {
    transparent: 42,
}"#);
    }
}

#[tokio::test]
async fn struct_vec_debug() {
    run! {
        let a: StructWithVecVc = StructWithVec { vec: vec![] }.into();
        assert_eq!(format!("{:?}", a.dbg().await?), r#"StructWithVec {
    vec: [],
}"#);

        let b: StructWithVecVc = StructWithVec { vec: vec![Transparent(42).into()] }.into();
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
        let a: StructWithIgnoreVc = StructWithIgnore { dont_ignore: 42, ignore: Mutex::new(()) }.into();
        assert_eq!(format!("{:?}", a.dbg().await?), r#"StructWithIgnore {
    dont_ignore: 42,
}"#);
    }
}

#[turbo_tasks::value(transparent, shared)]
struct Transparent(u32);

#[turbo_tasks::value(shared)]
enum Enum {
    None,
    Transparent(TransparentVc),
    Enum(EnumVc),
}

#[turbo_tasks::value(shared)]
struct StructUnit;

#[turbo_tasks::value(shared)]
struct StructWithTransparent {
    transparent: TransparentVc,
}

#[turbo_tasks::value(shared)]
struct StructWithOption {
    option: Option<TransparentVc>,
}

#[turbo_tasks::value(shared)]
struct StructWithVec {
    vec: Vec<TransparentVc>,
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
