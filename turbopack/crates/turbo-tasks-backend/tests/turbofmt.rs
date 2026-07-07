#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, ValueToString, Vc, turbobail, turbofmt};
use turbo_tasks_testing::{Registration, register, run_once};

static REGISTRATION: Registration = register!();

#[turbo_tasks::value(shared)]
#[derive(ValueToString)]
#[value_to_string("item {name} (count: {count})")]
struct FmtTest {
    name: RcStr,
    count: u32,
}

#[turbo_tasks::function(operation, root)]
async fn turbofmt_operation(value: ResolvedVc<FmtTest>) -> anyhow::Result<Vc<RcStr>> {
    let s: RcStr = turbofmt!("prefix {} vc {}", 42u32, value).await?;
    Ok(Vc::cell(s))
}

#[turbo_tasks::function(operation, root)]
async fn turbobail_operation(value: ResolvedVc<FmtTest>) -> anyhow::Result<Vc<RcStr>> {
    turbobail!("error: {} with {}", 42u32, value)
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_turbofmt() {
    run_once(&REGISTRATION, || async {
        let v = FmtTest {
            name: "foo".into(),
            count: 7,
        }
        .resolved_cell();
        assert_eq!(
            &*turbofmt_operation(v).read_strongly_consistent().await?,
            "prefix 42 vc item foo (count: 7)"
        );
        anyhow::Ok(())
    })
    .await
    .unwrap()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_turbobail() {
    run_once(&REGISTRATION, || async {
        let v = FmtTest {
            name: "bar".into(),
            count: 3,
        }
        .resolved_cell();

        let result = turbobail_operation(v).read_strongly_consistent().await;

        let err = result.unwrap_err();
        let root = err.root_cause().to_string();
        assert_eq!(root, "error: 42 with item bar (count: 3)");
        anyhow::Ok(())
    })
    .await
    .unwrap()
}
