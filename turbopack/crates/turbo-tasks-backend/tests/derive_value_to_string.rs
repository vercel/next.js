#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use std::fmt;

use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, ValueToString, Vc};
use turbo_tasks_testing::{Registration, register, run_once};

static REGISTRATION: Registration = register!();

#[turbo_tasks::function(operation)]
fn to_string_operation(value: ResolvedVc<Box<dyn ValueToString>>) -> Vc<RcStr> {
    value.to_string()
}

// --- Test types ---

#[turbo_tasks::value(shared)]
#[derive(ValueToString)]
struct SimpleDisplay(u32);

impl fmt::Display for SimpleDisplay {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "simple:{}", self.0)
    }
}

#[turbo_tasks::value(shared)]
#[derive(ValueToString)]
#[value_to_string("item {name} (count: {count})")]
struct NamedFields {
    name: RcStr,
    count: u32,
}

#[turbo_tasks::value(shared)]
#[derive(ValueToString)]
#[value_to_string("wrapped({0})")]
struct TupleStruct(u32);

#[turbo_tasks::value(shared)]
#[derive(ValueToString)]
#[value_to_string("constant-value")]
struct ConstantString;

#[turbo_tasks::value(shared)]
#[derive(ValueToString)]
#[value_to_string(self.name)]
struct DirectExpr {
    name: RcStr,
    #[allow(dead_code)]
    other: u32,
}

#[turbo_tasks::value(shared)]
#[derive(ValueToString)]
#[value_to_string("prefix({name}) suffix({count})")]
struct FormatExprs {
    name: RcStr,
    count: u32,
}

#[turbo_tasks::value(shared)]
#[derive(ValueToString)]
#[value_to_string("inner: {inner}")]
struct VcExprDelegate {
    inner: ResolvedVc<NamedFields>,
}

#[turbo_tasks::value(shared)]
#[derive(ValueToString)]
enum Kind {
    #[value_to_string("module")]
    Module,
    #[value_to_string("asset({0})")]
    Asset(RcStr),
    #[value_to_string("entry {name}")]
    Entry { name: RcStr },
}

#[turbo_tasks::value(shared)]
#[derive(ValueToString)]
enum DefaultNames {
    Alpha,
    Beta,
}

#[turbo_tasks::value(shared)]
#[derive(ValueToString)]
enum MixedEnum {
    #[value_to_string("literal")]
    Literal,
    #[value_to_string(_0)]
    Delegate(ResolvedVc<ConstantString>),
    #[value_to_string("wrapped({})", name)]
    ExprNamed { name: RcStr },
}

// --- Tests ---

/// No attribute: delegates to Display::to_string(self).
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_display_delegation() {
    run_once(&REGISTRATION, || async {
        let v: ResolvedVc<Box<dyn ValueToString>> =
            ResolvedVc::upcast(SimpleDisplay(42).resolved_cell());
        assert_eq!(
            &*to_string_operation(v).read_strongly_consistent().await?,
            "simple:42"
        );
        anyhow::Ok(())
    })
    .await
    .unwrap()
}

/// FormatAutoFields on structs: named fields, positional fields, and constant strings.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_struct_format_strings() {
    run_once(&REGISTRATION, || async {
        let v1: ResolvedVc<Box<dyn ValueToString>> = ResolvedVc::upcast(
            NamedFields {
                name: "foo".into(),
                count: 7,
            }
            .resolved_cell(),
        );
        assert_eq!(
            &*to_string_operation(v1).read_strongly_consistent().await?,
            "item foo (count: 7)"
        );

        let v2: ResolvedVc<Box<dyn ValueToString>> =
            ResolvedVc::upcast(TupleStruct(99).resolved_cell());
        assert_eq!(
            &*to_string_operation(v2).read_strongly_consistent().await?,
            "wrapped(99)"
        );

        let v3: ResolvedVc<Box<dyn ValueToString>> =
            ResolvedVc::upcast(ConstantString.resolved_cell());
        assert_eq!(
            &*to_string_operation(v3).read_strongly_consistent().await?,
            "constant-value"
        );

        anyhow::Ok(())
    })
    .await
    .unwrap()
}

/// DirectExpr form: single expression delegation.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_struct_direct_expr() {
    run_once(&REGISTRATION, || async {
        let v: ResolvedVc<Box<dyn ValueToString>> = ResolvedVc::upcast(
            DirectExpr {
                name: "hello".into(),
                other: 42,
            }
            .resolved_cell(),
        );
        assert_eq!(
            &*to_string_operation(v).read_strongly_consistent().await?,
            "hello"
        );
        anyhow::Ok(())
    })
    .await
    .unwrap()
}

/// FormatExprs on structs: format string with explicit expressions, including Vc delegation.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_struct_format_exprs() {
    run_once(&REGISTRATION, || async {
        let v1: ResolvedVc<Box<dyn ValueToString>> = ResolvedVc::upcast(
            FormatExprs {
                name: "test".into(),
                count: 5,
            }
            .resolved_cell(),
        );
        assert_eq!(
            &*to_string_operation(v1).read_strongly_consistent().await?,
            "prefix(test) suffix(5)"
        );

        let inner = NamedFields {
            name: "bar".into(),
            count: 3,
        }
        .resolved_cell();
        let v2: ResolvedVc<Box<dyn ValueToString>> =
            ResolvedVc::upcast(VcExprDelegate { inner }.resolved_cell());
        assert_eq!(
            &*to_string_operation(v2).read_strongly_consistent().await?,
            "inner: item bar (count: 3)"
        );

        anyhow::Ok(())
    })
    .await
    .unwrap()
}

/// Enum with per-variant auto-field format strings and default variant names.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_enum_variants() {
    run_once(&REGISTRATION, || async {
        // Per-variant attributes
        assert_eq!(
            &*to_string_operation(ResolvedVc::upcast(Kind::Module.resolved_cell()))
                .read_strongly_consistent()
                .await?,
            "module"
        );
        assert_eq!(
            &*to_string_operation(ResolvedVc::upcast(
                Kind::Asset("main.js".into()).resolved_cell()
            ))
            .read_strongly_consistent()
            .await?,
            "asset(main.js)"
        );
        assert_eq!(
            &*to_string_operation(ResolvedVc::upcast(
                Kind::Entry {
                    name: "index".into(),
                }
                .resolved_cell(),
            ))
            .read_strongly_consistent()
            .await?,
            "entry index"
        );

        // Default variant names (no attribute)
        assert_eq!(
            &*to_string_operation(ResolvedVc::upcast(DefaultNames::Alpha.resolved_cell()))
                .read_strongly_consistent()
                .await?,
            "Alpha"
        );
        assert_eq!(
            &*to_string_operation(ResolvedVc::upcast(DefaultNames::Beta.resolved_cell()))
                .read_strongly_consistent()
                .await?,
            "Beta"
        );

        anyhow::Ok(())
    })
    .await
    .unwrap()
}

/// Enum with mixed forms: constant literal, Vc delegation, and format exprs.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_mixed_enum() {
    run_once(&REGISTRATION, || async {
        assert_eq!(
            &*to_string_operation(ResolvedVc::upcast(MixedEnum::Literal.resolved_cell()))
                .read_strongly_consistent()
                .await?,
            "literal"
        );

        let inner = ConstantString.resolved_cell();
        let v2: ResolvedVc<Box<dyn ValueToString>> =
            ResolvedVc::upcast(MixedEnum::Delegate(inner).resolved_cell());
        assert_eq!(
            &*to_string_operation(v2).read_strongly_consistent().await?,
            "constant-value"
        );

        let v3: ResolvedVc<Box<dyn ValueToString>> = ResolvedVc::upcast(
            (MixedEnum::ExprNamed {
                name: "world".into(),
            })
            .resolved_cell(),
        );
        assert_eq!(
            &*to_string_operation(v3).read_strongly_consistent().await?,
            "wrapped(world)"
        );

        anyhow::Ok(())
    })
    .await
    .unwrap()
}
