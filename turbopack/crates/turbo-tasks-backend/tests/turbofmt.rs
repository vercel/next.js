#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use turbo_rcstr::RcStr;
use turbo_tasks::{ValueToString, Vc, turbobail, turbofmt};
use turbo_tasks_testing::{Registration, register, run_once};

static REGISTRATION: Registration = register!();

#[turbo_tasks::value(shared)]
#[derive(ValueToString)]
#[value_to_string("item {name} (count: {count})")]
struct FmtTest {
    name: RcStr,
    count: u32,
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_turbofmt() {
    run_once(&REGISTRATION, || async {
        let v: Vc<FmtTest> = FmtTest {
            name: "foo".into(),
            count: 7,
        }
        .cell();
        let s: RcStr = turbofmt!("prefix {} vc {}", 42u32, v).await?;
        assert_eq!(&*s, "prefix 42 vc item foo (count: 7)");
        anyhow::Ok(())
    })
    .await
    .unwrap()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_turbobail() {
    run_once(&REGISTRATION, || async {
        let v: Vc<FmtTest> = FmtTest {
            name: "bar".into(),
            count: 3,
        }
        .cell();

        let result: anyhow::Result<()> = async {
            turbobail!("error: {} with {}", 42u32, v);
            #[allow(unreachable_code)]
            Ok(())
        }
        .await;

        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err().to_string(),
            "error: 42 with item bar (count: 3)"
        );
        anyhow::Ok(())
    })
    .await
    .unwrap()
}
