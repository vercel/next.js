#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use anyhow::Result;
use turbo_tasks::Vc;
use turbo_tasks_testing::{Registration, register, run_once};

static REGISTRATION: Registration = register!();

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn filtered_trait_method_args() -> Result<()> {
    run_once(&REGISTRATION, || async {
        let uses_arg = UsesArg.cell();
        assert_eq!(
            uses_arg.method_with_arg(0).to_resolved().await?,
            uses_arg.method_with_arg(0).to_resolved().await?,
        );
        assert_ne!(
            uses_arg.method_with_arg(0).to_resolved().await?,
            uses_arg.method_with_arg(1).to_resolved().await?,
        );

        let ignores_arg = IgnoresArg.cell();
        assert_eq!(
            ignores_arg.method_with_arg(0).to_resolved().await?,
            ignores_arg.method_with_arg(0).to_resolved().await?,
        );
        assert_eq!(
            ignores_arg.method_with_arg(0).to_resolved().await?,
            ignores_arg.method_with_arg(1).to_resolved().await?,
        );
        Ok(())
    })
    .await
}

#[turbo_tasks::value_trait]
trait ExampleTrait {
    #[turbo_tasks::function]
    fn method_with_arg(&self, number: i32) -> Vc<()>;
}

#[turbo_tasks::value]
struct UsesArg;

#[turbo_tasks::value_impl]
impl ExampleTrait for UsesArg {
    #[turbo_tasks::function]
    fn method_with_arg(&self, number: i32) -> Vc<()> {
        let _ = number;
        Vc::cell(())
    }
}

#[turbo_tasks::value]
struct IgnoresArg;

#[turbo_tasks::value_impl]
impl ExampleTrait for IgnoresArg {
    #[turbo_tasks::function]
    fn method_with_arg(&self, _number: i32) -> Vc<()> {
        Vc::cell(())
    }
}
