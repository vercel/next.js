#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use anyhow::Result;
use turbo_tasks::Vc;
use turbo_tasks_testing::{register, run, Registration};

static REGISTRATION: Registration = register!();

#[tokio::test]
async fn functions() {
    run(&REGISTRATION, || async {
        assert_eq!(*fn_plain().await?, 42);
        assert_eq!(*fn_arg(43).await?, 43);
        assert_eq!(*fn_vc_arg(Vc::cell(44)).await?, 44);
        assert_eq!(*async_fn_plain().await?, 42);
        assert_eq!(*async_fn_arg(43).await?, 43);
        assert_eq!(*async_fn_vc_arg(Vc::cell(44)).await?, 44);
        anyhow::Ok(())
    })
    .await
    .unwrap()
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
async fn async_fn_plain() -> Result<Vc<u32>> {
    Ok(Vc::cell(42))
}

#[turbo_tasks::function]
async fn async_fn_arg(n: u32) -> Result<Vc<u32>> {
    Ok(Vc::cell(n))
}

#[turbo_tasks::function]
async fn async_fn_vc_arg(n: Vc<u32>) -> Result<Vc<u32>> {
    Ok(Vc::cell(*n.await?))
}

#[tokio::test]
async fn methods() {
    run(&REGISTRATION, || async {
        assert_eq!(*Value::static_method().await?, 42);
        assert_eq!(*Value::async_static_method().await?, 42);

        let value = Value(43).cell();
        assert_eq!(*value.method().await?, 43);
        assert_eq!(*value.async_method().await?, 43);
        assert_eq!(*value.vc_method().await?, 42);
        assert_eq!(*value.async_vc_method().await?, 43);
        anyhow::Ok(())
    })
    .await
    .unwrap()
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
    async fn async_static_method() -> Result<Vc<u32>> {
        Ok(Vc::cell(42))
    }

    #[turbo_tasks::function]
    fn method(&self) -> Vc<u32> {
        Vc::cell(self.0)
    }

    #[turbo_tasks::function]
    async fn async_method(&self) -> Result<Vc<u32>> {
        Ok(Vc::cell(self.0))
    }

    #[turbo_tasks::function]
    fn vc_method(self: Vc<Self>) -> Vc<u32> {
        Vc::cell(42)
    }

    #[turbo_tasks::function]
    async fn async_vc_method(&self) -> Result<Vc<u32>> {
        Ok(Vc::cell(self.0))
    }
}

#[tokio::test]
async fn trait_methods() {
    run(&REGISTRATION, || async {
        assert_eq!(*Value::static_trait_method().await?, 42);
        assert_eq!(*Value::async_static_trait_method().await?, 42);

        let value = Value(43).cell();
        assert_eq!(*value.trait_method().await?, 43);
        assert_eq!(*value.async_trait_method().await?, 43);
        assert_eq!(*value.default_trait_method().await?, 42);
        assert_eq!(*value.default_async_trait_method().await?, 42);

        let trait_value: Vc<Box<dyn ValueTrait>> = Vc::upcast(value);
        assert_eq!(*trait_value.trait_method().await?, 43);
        assert_eq!(*trait_value.async_trait_method().await?, 43);
        assert_eq!(*trait_value.default_trait_method().await?, 42);
        assert_eq!(*trait_value.default_async_trait_method().await?, 42);

        let value = wrap_value(value);
        assert_eq!(*value.trait_method().await?, 43);
        assert_eq!(*value.async_trait_method().await?, 43);
        assert_eq!(*value.default_trait_method().await?, 42);
        assert_eq!(*value.default_async_trait_method().await?, 42);

        let trait_value = wrap_trait_value(trait_value);
        assert_eq!(*trait_value.trait_method().await?, 43);
        assert_eq!(*trait_value.async_trait_method().await?, 43);
        assert_eq!(*trait_value.default_trait_method().await?, 42);
        assert_eq!(*trait_value.default_async_trait_method().await?, 42);
        anyhow::Ok(())
    })
    .await
    .unwrap()
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
    fn static_trait_method() -> Vc<u32>;
    async fn async_static_trait_method() -> Result<Vc<u32>>;
    fn default_static_trait_method() -> Vc<u32> {
        Vc::cell(42)
    }
    async fn default_async_static_trait_method() -> Result<Vc<u32>> {
        Ok(Vc::cell(42))
    }
    fn trait_method(&self) -> Vc<u32>;
    fn async_trait_method(&self) -> Result<Vc<u32>>;
    fn default_trait_method(self: Vc<Self>) -> Vc<u32> {
        Vc::cell(42)
    }
    async fn default_async_trait_method(self: Vc<Self>) -> Result<Vc<u32>> {
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
    async fn async_static_trait_method() -> Result<Vc<u32>> {
        Ok(Vc::cell(42))
    }

    #[turbo_tasks::function]
    fn trait_method(&self) -> Vc<u32> {
        Vc::cell(self.0)
    }

    #[turbo_tasks::function]
    async fn async_trait_method(&self) -> Result<Vc<u32>> {
        Ok(Vc::cell(self.0))
    }
}
