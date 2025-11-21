#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use anyhow::Result;
use turbo_tasks::Vc;
use turbo_tasks_testing::{Registration, register, run_once};

static REGISTRATION: Registration = register!();

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn filtered_impl_method_args() -> Result<()> {
    run_once(&REGISTRATION, || async {
        let uses_arg = UsesArg(0).cell();
        assert_eq!(
            uses_arg.method_with_arg(0).to_resolved().await?,
            uses_arg.method_with_arg(0).to_resolved().await?,
        );
        assert_ne!(
            uses_arg.method_with_arg(0).to_resolved().await?,
            uses_arg.method_with_arg(1).to_resolved().await?,
        );

        let ignores_arg = IgnoresArg(0).cell();
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

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn filtered_trait_method_args() -> Result<()> {
    run_once(&REGISTRATION, || async {
        let uses_arg = UsesArg(0).cell();
        assert_eq!(
            uses_arg.trait_method_with_arg(0).to_resolved().await?,
            uses_arg.trait_method_with_arg(0).to_resolved().await?,
        );
        assert_ne!(
            uses_arg.trait_method_with_arg(0).to_resolved().await?,
            uses_arg.trait_method_with_arg(1).to_resolved().await?,
        );

        let ignores_arg = IgnoresArg(0).cell();
        assert_eq!(
            ignores_arg.trait_method_with_arg(0).to_resolved().await?,
            ignores_arg.trait_method_with_arg(0).to_resolved().await?,
        );
        assert_eq!(
            ignores_arg.trait_method_with_arg(0).to_resolved().await?,
            ignores_arg.trait_method_with_arg(1).to_resolved().await?,
        );

        Ok(())
    })
    .await
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn filtered_impl_method_self() -> Result<()> {
    run_once(&REGISTRATION, || async {
        let uses_arg = UsesArg(0).cell();
        let uses_arg2 = UsesArg(1).cell();
        assert_eq!(
            uses_arg.method_with_arg(0).to_resolved().await?,
            uses_arg2.method_with_arg(0).to_resolved().await?,
        );
        assert_eq!(
            uses_arg.method_with_arg(1).to_resolved().await?,
            uses_arg2.method_with_arg(1).to_resolved().await?,
        );

        let ignores_arg = IgnoresArg(0).cell();
        let ignores_arg2 = IgnoresArg(1).cell();
        assert_eq!(
            ignores_arg.method_with_arg(0).to_resolved().await?,
            ignores_arg2.method_with_arg(0).to_resolved().await?,
        );
        assert_eq!(
            ignores_arg.method_with_arg(1).to_resolved().await?,
            ignores_arg2.method_with_arg(1).to_resolved().await?,
        );
        assert_eq!(
            ignores_arg.method_with_arg(0).to_resolved().await?,
            ignores_arg2.method_with_arg(1).to_resolved().await?,
        );

        Ok(())
    })
    .await
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn filtered_trait_method_self() -> Result<()> {
    run_once(&REGISTRATION, || async {
        let uses_arg = UsesArg(0).cell();
        let uses_arg2 = UsesArg(1).cell();
        assert_eq!(
            uses_arg.trait_method_with_arg(0).to_resolved().await?,
            uses_arg2.trait_method_with_arg(0).to_resolved().await?,
        );
        assert_eq!(
            uses_arg.trait_method_with_arg(1).to_resolved().await?,
            uses_arg2.trait_method_with_arg(1).to_resolved().await?,
        );

        let ignores_arg = IgnoresArg(0).cell();
        let ignores_arg2 = IgnoresArg(1).cell();
        assert_eq!(
            ignores_arg.trait_method_with_arg(0).to_resolved().await?,
            ignores_arg2.trait_method_with_arg(0).to_resolved().await?,
        );
        assert_eq!(
            ignores_arg.trait_method_with_arg(1).to_resolved().await?,
            ignores_arg2.trait_method_with_arg(1).to_resolved().await?,
        );
        assert_eq!(
            ignores_arg.trait_method_with_arg(0).to_resolved().await?,
            ignores_arg2.trait_method_with_arg(1).to_resolved().await?,
        );

        Ok(())
    })
    .await
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn filtered_plain_method_args() -> Result<()> {
    run_once(&REGISTRATION, || async {
        assert_eq!(
            method_with_arg(0).to_resolved().await?,
            method_with_arg(0).to_resolved().await?,
        );
        assert_ne!(
            method_with_arg(0).to_resolved().await?,
            method_with_arg(1).to_resolved().await?,
        );
        assert_eq!(
            method_with_ignored_arg(0).to_resolved().await?,
            method_with_ignored_arg(0).to_resolved().await?,
        );
        assert_eq!(
            method_with_ignored_arg(0).to_resolved().await?,
            method_with_ignored_arg(1).to_resolved().await?,
        );

        Ok(())
    })
    .await
}

#[turbo_tasks::value_trait]
trait ExampleTrait {
    #[turbo_tasks::function]
    fn trait_method_with_arg(&self, number: i32) -> Vc<()>;
}

#[turbo_tasks::value]
struct UsesArg(i32);

#[turbo_tasks::value_impl]
impl UsesArg {
    #[turbo_tasks::function]
    fn method_with_arg(&self, number: i32) -> Vc<()> {
        let _ = number;
        Vc::cell(())
    }
}

#[turbo_tasks::value_impl]
impl ExampleTrait for UsesArg {
    #[turbo_tasks::function]
    fn trait_method_with_arg(&self, number: i32) -> Vc<()> {
        let _ = number;
        Vc::cell(())
    }
}

#[turbo_tasks::value]
struct IgnoresArg(i32);

#[turbo_tasks::value_impl]
impl IgnoresArg {
    #[turbo_tasks::function]
    fn method_with_arg(&self, _number: i32) -> Vc<()> {
        Vc::cell(())
    }
}

#[turbo_tasks::value_impl]
impl ExampleTrait for IgnoresArg {
    #[turbo_tasks::function]
    fn trait_method_with_arg(&self, _number: i32) -> Vc<()> {
        Vc::cell(())
    }
}

#[turbo_tasks::function]
fn method_with_arg(number: i32) -> Vc<()> {
    let _ = number;
    Vc::cell(())
}

#[turbo_tasks::function]
fn method_with_ignored_arg(_number: i32) -> Vc<()> {
    Vc::cell(())
}
