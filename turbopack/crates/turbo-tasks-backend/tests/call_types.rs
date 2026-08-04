#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use anyhow::Result;
use turbo_tasks::{Vc, read};
use turbo_tasks_testing::{Registration, register, run_once};

static REGISTRATION: Registration = register!();

#[turbo_tasks::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_functions() {
    let mut nonce = 0;
    run_once(&REGISTRATION, move || {
        // pass a nonce to re-run the test body on every turbo-tasks restart
        nonce += 1;
        async move {
            test_functions_operation(nonce)
                .read_strongly_consistent()
                .await
        }
    })
    .await
    .unwrap()
}

#[turbo_tasks::function(operation, root)]
async fn test_functions_operation(nonce: u32) -> Result<Vc<()>> {
    let _ = nonce; // ensure the nonce is part of our cache key

    assert_eq!(*read!(fn_plain())?, 42);
    assert_eq!(*read!(fn_arg(43))?, 43);
    assert_eq!(*read!(fn_vc_arg(Vc::cell(44)))?, 44);
    assert_eq!(*read!(async_fn_plain())?, 42);
    assert_eq!(*read!(async_fn_arg(43))?, 43);
    assert_eq!(*read!(async_fn_vc_arg(Vc::cell(44)))?, 44);
    Ok(Vc::cell(()))
}

#[turbo_tasks::function]
fn fn_plain() -> Vc<u32> {
    Vc::cell(42)
}

#[turbo_tasks::function]
fn fn_arg(n: u32) -> Vc<u32> {
    Vc::cell(n)
}

#[turbo_tasks::function]
fn fn_vc_arg(n: Vc<u32>) -> Vc<u32> {
    n
}

#[turbo_tasks::function]
fn async_fn_plain() -> Result<Vc<u32>> {
    Ok(Vc::cell(42))
}

#[turbo_tasks::function]
fn async_fn_arg(n: u32) -> Result<Vc<u32>> {
    Ok(Vc::cell(n))
}

#[turbo_tasks::function]
async fn async_fn_vc_arg(n: Vc<u32>) -> Result<Vc<u32>> {
    Ok(Vc::cell(*read!(n)?))
}

#[turbo_tasks::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_methods() {
    run_once(&REGISTRATION, || async {
        test_methods_operation().read_strongly_consistent().await?;
        anyhow::Ok(())
    })
    .await
    .unwrap()
}

#[turbo_tasks::function(operation, root)]
async fn test_methods_operation() -> Result<Vc<()>> {
    assert_eq!(*read!(Value::static_method())?, 42);
    assert_eq!(*read!(Value::async_static_method())?, 42);

    let value = Value(43).cell();
    assert_eq!(*read!(value.method())?, 43);
    assert_eq!(*read!(value.async_method())?, 43);
    assert_eq!(*read!(value.vc_method())?, 42);
    assert_eq!(*read!(value.async_vc_method())?, 43);
    Ok(Vc::cell(()))
}

#[turbo_tasks::value]
struct Value(u32);

#[turbo_tasks::value_impl]
impl Value {
    #[turbo_tasks::function]
    fn static_method() -> Vc<u32> {
        Vc::cell(42)
    }

    #[turbo_tasks::function]
    fn async_static_method() -> Result<Vc<u32>> {
        Ok(Vc::cell(42))
    }

    #[turbo_tasks::function]
    fn method(&self) -> Vc<u32> {
        Vc::cell(self.0)
    }

    #[turbo_tasks::function]
    fn async_method(&self) -> Result<Vc<u32>> {
        Ok(Vc::cell(self.0))
    }

    #[turbo_tasks::function]
    fn vc_method(self: Vc<Self>) -> Vc<u32> {
        Vc::cell(42)
    }

    #[turbo_tasks::function]
    fn async_vc_method(&self) -> Result<Vc<u32>> {
        Ok(Vc::cell(self.0))
    }
}

#[turbo_tasks::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_trait_methods() {
    run_once(&REGISTRATION, || async {
        test_trait_methods_operation()
            .read_strongly_consistent()
            .await?;
        anyhow::Ok(())
    })
    .await
    .unwrap()
}

#[turbo_tasks::function(operation, root)]
async fn test_trait_methods_operation() -> Result<Vc<()>> {
    assert_eq!(*read!(Value::static_trait_method())?, 42);
    assert_eq!(*read!(Value::async_static_trait_method())?, 42);
    assert_eq!(*read!(Value::default_static_trait_method())?, 42);
    assert_eq!(*read!(Value::default_async_static_trait_method())?, 42);

    let value = Value(43).cell();
    assert_eq!(*read!(value.trait_method())?, 43);
    assert_eq!(*read!(value.async_trait_method())?, 43);
    assert_eq!(*read!(value.default_trait_method())?, 42);
    assert_eq!(*read!(value.default_async_trait_method())?, 42);

    let trait_value: Vc<Box<dyn ValueTrait>> = Vc::upcast(value);
    assert_eq!(*read!(trait_value.trait_method())?, 43);
    assert_eq!(*read!(trait_value.async_trait_method())?, 43);
    assert_eq!(*read!(trait_value.default_trait_method())?, 42);
    assert_eq!(*read!(trait_value.default_async_trait_method())?, 42);

    let value = wrap_value(value);
    assert_eq!(*read!(value.trait_method())?, 43);
    assert_eq!(*read!(value.async_trait_method())?, 43);
    assert_eq!(*read!(value.default_trait_method())?, 42);
    assert_eq!(*read!(value.default_async_trait_method())?, 42);

    let trait_value = wrap_trait_value(trait_value);
    assert_eq!(*read!(trait_value.trait_method())?, 43);
    assert_eq!(*read!(trait_value.async_trait_method())?, 43);
    assert_eq!(*read!(trait_value.default_trait_method())?, 42);
    assert_eq!(*read!(trait_value.default_async_trait_method())?, 42);
    Ok(Vc::cell(()))
}

#[turbo_tasks::function]
fn wrap_value(v: Vc<Value>) -> Vc<Value> {
    v
}

#[turbo_tasks::function]
fn wrap_trait_value(v: Vc<Box<dyn ValueTrait>>) -> Vc<Box<dyn ValueTrait>> {
    v
}

#[turbo_tasks::value_trait]
trait ValueTrait {
    #[turbo_tasks::function]
    fn static_trait_method() -> Vc<u32>;
    #[turbo_tasks::function]
    async fn async_static_trait_method() -> Result<Vc<u32>>;
    #[turbo_tasks::function]
    fn default_static_trait_method() -> Vc<u32> {
        Vc::cell(42)
    }
    #[turbo_tasks::function]
    fn default_async_static_trait_method() -> Result<Vc<u32>> {
        Ok(Vc::cell(42))
    }
    #[turbo_tasks::function]
    fn trait_method(&self) -> Vc<u32>;
    #[turbo_tasks::function]
    fn async_trait_method(&self) -> Result<Vc<u32>>;
    #[turbo_tasks::function]
    fn default_trait_method(self: Vc<Self>) -> Vc<u32> {
        Vc::cell(42)
    }
    #[turbo_tasks::function]
    fn default_async_trait_method(self: Vc<Self>) -> Result<Vc<u32>> {
        Ok(Vc::cell(42))
    }
}

#[turbo_tasks::value_impl]
impl ValueTrait for Value {
    #[turbo_tasks::function]
    fn static_trait_method() -> Vc<u32> {
        Vc::cell(42)
    }

    #[turbo_tasks::function]
    fn async_static_trait_method() -> Result<Vc<u32>> {
        Ok(Vc::cell(42))
    }

    #[turbo_tasks::function]
    fn trait_method(&self) -> Vc<u32> {
        Vc::cell(self.0)
    }

    #[turbo_tasks::function]
    fn async_trait_method(&self) -> Result<Vc<u32>> {
        Ok(Vc::cell(self.0))
    }
}
