#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use std::fmt;

use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ReadRef, ResolvedVc, ValueToString, Vc};
use turbo_tasks_testing::{Registration, register, run_once};

static REGISTRATION: Registration = register!();

#[turbo_tasks::function(operation, root)]
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

/// A Display type for torture-testing enum field resolution.
#[turbo_tasks::value(shared)]
struct DisplayVal(u32);

impl fmt::Display for DisplayVal {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "dv:{}", self.0)
    }
}

/// Torture test: one enum variant with Display, RcStr, Vc, and ResolvedVc fields,
/// exercising all ValueToStringify dispatch levels in a single match arm.
#[turbo_tasks::value(shared)]
#[derive(ValueToString)]
enum TortureEnum {
    /// Auto-field format with Display, RcStr, and ResolvedVc in one variant.
    #[value_to_string("d={display_val} r={rc_str} rv1={resolved_named} rv2={resolved_const}")]
    AllFieldTypes {
        display_val: DisplayVal,
        rc_str: RcStr,
        resolved_named: ResolvedVc<NamedFields>,
        resolved_const: ResolvedVc<ConstantString>,
    },
    /// FormatExprs form with a ResolvedVc positional arg.
    #[value_to_string("expr({})", _0)]
    ExprVc(ResolvedVc<NamedFields>),
    /// DirectExpr form delegating to a ResolvedVc field.
    #[value_to_string(_0)]
    DelegateVc(ResolvedVc<ConstantString>),
    /// ReadRef field.
    #[value_to_string("read={0}")]
    WithReadRef(ReadRef<NamedFields>),
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_torture_enum() {
    run_once(&REGISTRATION, || async {
        let named_resolved = NamedFields {
            name: "x".into(),
            count: 1,
        }
        .resolved_cell();
        let named_resolved2 = NamedFields {
            name: "y".into(),
            count: 2,
        }
        .resolved_cell();
        let const_resolved = ConstantString.resolved_cell();

        // AllFieldTypes: Display + RcStr + ResolvedVc + ResolvedVc
        let v1 = ResolvedVc::upcast(
            (TortureEnum::AllFieldTypes {
                display_val: DisplayVal(42),
                rc_str: rcstr!("hello"),
                resolved_named: named_resolved,
                resolved_const: const_resolved,
            })
            .resolved_cell(),
        );
        assert_eq!(
            &*to_string_operation(v1).read_strongly_consistent().await?,
            "d=dv:42 r=hello rv1=item x (count: 1) rv2=constant-value"
        );

        // ExprVc: FormatExprs with ResolvedVc positional arg
        let v2 = ResolvedVc::upcast(TortureEnum::ExprVc(named_resolved2).resolved_cell());
        assert_eq!(
            &*to_string_operation(v2).read_strongly_consistent().await?,
            "expr(item y (count: 2))"
        );

        // DelegateVc: DirectExpr delegating to ResolvedVc
        let v3 = ResolvedVc::upcast(TortureEnum::DelegateVc(const_resolved).resolved_cell());
        assert_eq!(
            &*to_string_operation(v3).read_strongly_consistent().await?,
            "constant-value"
        );

        // WithReadRef: ReadRef field
        let named_read: ReadRef<NamedFields> = named_resolved.await?;
        let v4 = ResolvedVc::upcast(TortureEnum::WithReadRef(named_read).resolved_cell());
        assert_eq!(
            &*to_string_operation(v4).read_strongly_consistent().await?,
            "read=item x (count: 1)"
        );

        anyhow::Ok(())
    })
    .await
    .unwrap()
}
