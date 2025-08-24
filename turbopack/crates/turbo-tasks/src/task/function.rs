//! # Function tasks
//!
//! This module contains the trait definitions and implementations that are
//! necessary for accepting functions as tasks when using the
//! `turbo_tasks::function` macro.
//!
//! This system is inspired by Bevy's Systems and Axum's Handlers.
//!
//! The original principle is somewhat simple: a function is accepted if all
//! of its arguments implement `TaskInput` and its return type implements
//! `TaskOutput`. There are a few hoops one needs to jump through to make this
//! work, but they are described in this blog post:
//! <https://blog.logrocket.com/rust-bevy-entity-component-system/>
//!
//! However, there is an additional complication in our case: async methods
//! that accept a reference to the receiver as their first argument.
//!
//! This complication handled through our own version of the `async_trait`
//! crate, which allows us to target `async fn` as trait bounds. The naive
//! approach runs into many issues with lifetimes, hence the need for an
//! intermediate trait. However, this implementation doesn't support all async
//! methods (see commented out tests).

use std::{future::Future, marker::PhantomData, pin::Pin};

use anyhow::Result;

use super::{TaskInput, TaskOutput};
use crate::{RawVc, Vc, VcRead, VcValueType, magic_any::MagicAny};

pub type NativeTaskFuture = Pin<Box<dyn Future<Output = Result<RawVc>> + Send>>;

pub trait TaskFn: Send + Sync + 'static {
    fn functor(&self, this: Option<RawVc>, arg: &dyn MagicAny) -> Result<NativeTaskFuture>;
}

pub trait IntoTaskFn<Mode, Inputs> {
    type TaskFn: TaskFn;

    fn into_task_fn(self) -> Self::TaskFn;
}

impl<F, Mode, Inputs> IntoTaskFn<Mode, Inputs> for F
where
    F: TaskFnInputFunction<Mode, Inputs>,
    Mode: TaskFnMode,
    Inputs: TaskInputs,
{
    type TaskFn = FunctionTaskFn<F, Mode, Inputs>;

    fn into_task_fn(self) -> Self::TaskFn {
        FunctionTaskFn {
            task_fn: self,
            mode: PhantomData,
            inputs: PhantomData,
        }
    }
}

pub trait IntoTaskFnWithThis<Mode, This, Inputs> {
    type TaskFn: TaskFn;

    fn into_task_fn_with_this(self) -> Self::TaskFn;
}

impl<F, Mode, This, Inputs> IntoTaskFnWithThis<Mode, This, Inputs> for F
where
    F: TaskFnInputFunctionWithThis<Mode, This, Inputs>,
    Mode: TaskFnMode,
    This: Sync + Send + 'static,
    Inputs: TaskInputs,
{
    type TaskFn = FunctionTaskFnWithThis<F, Mode, This, Inputs>;

    fn into_task_fn_with_this(self) -> Self::TaskFn {
        FunctionTaskFnWithThis {
            task_fn: self,
            mode: PhantomData,
            this: PhantomData,
            inputs: PhantomData,
        }
    }
}

pub struct FunctionTaskFn<F, Mode: TaskFnMode, Inputs: TaskInputs> {
    task_fn: F,
    mode: PhantomData<Mode>,
    inputs: PhantomData<Inputs>,
}

impl<F, Mode, Inputs> TaskFn for FunctionTaskFn<F, Mode, Inputs>
where
    F: TaskFnInputFunction<Mode, Inputs>,
    Mode: TaskFnMode,
    Inputs: TaskInputs,
{
    fn functor(&self, _this: Option<RawVc>, arg: &dyn MagicAny) -> Result<NativeTaskFuture> {
        TaskFnInputFunction::functor(&self.task_fn, arg)
    }
}

pub struct FunctionTaskFnWithThis<
    F,
    Mode: TaskFnMode,
    This: Sync + Send + 'static,
    Inputs: TaskInputs,
> {
    task_fn: F,
    mode: PhantomData<Mode>,
    this: PhantomData<This>,
    inputs: PhantomData<Inputs>,
}

impl<F, Mode, This, Inputs> TaskFn for FunctionTaskFnWithThis<F, Mode, This, Inputs>
where
    F: TaskFnInputFunctionWithThis<Mode, This, Inputs>,
    Mode: TaskFnMode,
    This: Sync + Send + 'static,
    Inputs: TaskInputs,
{
    fn functor(&self, this: Option<RawVc>, arg: &dyn MagicAny) -> Result<NativeTaskFuture> {
        let Some(this) = this else {
            panic!("Method needs a `self` argument");
        };
        TaskFnInputFunctionWithThis::functor(&self.task_fn, this, arg)
    }
}

trait TaskFnInputFunction<Mode: TaskFnMode, Inputs: TaskInputs>: Send + Sync + Clone + 'static {
    fn functor(&self, arg: &dyn MagicAny) -> Result<NativeTaskFuture>;
}

trait TaskFnInputFunctionWithThis<Mode: TaskFnMode, This: Sync + Send + 'static, Inputs: TaskInputs>:
    Send + Sync + Clone + 'static
{
    fn functor(&self, this: RawVc, arg: &dyn MagicAny) -> Result<NativeTaskFuture>;
}

pub trait TaskInputs: Send + Sync + 'static {}

/// Modes to allow multiple `TaskFnInputFunction` blanket implementations on
/// `Fn`s. Even though the implementations are non-conflicting in practice, they
/// could be in theory (at least from with the compiler's current limitations).
/// Despite this, the compiler is still able to infer the correct mode from a
/// function.
pub trait TaskFnMode: Send + Sync + 'static {}

pub struct FunctionMode;
impl TaskFnMode for FunctionMode {}

pub struct AsyncFunctionMode;
impl TaskFnMode for AsyncFunctionMode {}

pub struct MethodMode;
impl TaskFnMode for MethodMode {}

pub struct AsyncMethodMode;
impl TaskFnMode for AsyncMethodMode {}

macro_rules! task_inputs_impl {
    ( $( $arg:ident )* ) => {
        impl<$($arg,)*> TaskInputs for ($($arg,)*)
        where
            $($arg: TaskInput + 'static,)*
        {}
    }
}

/// Downcast, and clone all the arguments in the singular `arg` tuple.
///
/// This helper function for `task_fn_impl!()` reduces the amount of code inside the macro, and
/// gives the compiler more chances to dedupe monomorphized code across small functions with less
/// typevars.
fn get_args<T: MagicAny + Clone>(arg: &dyn MagicAny) -> Result<T> {
    let value = arg.downcast_ref::<T>().cloned();
    #[cfg(debug_assertions)]
    return anyhow::Context::with_context(value, || {
        crate::native_function::debug_downcast_args_error_msg(std::any::type_name::<T>(), arg)
    });
    #[cfg(not(debug_assertions))]
    return anyhow::Context::context(value, "Invalid argument type");
}

// Helper function for `task_fn_impl!()`
async fn output_try_into_non_local_raw_vc(output: impl TaskOutput) -> Result<RawVc> {
    // TODO: Potential future optimization: If we know we're inside a local task, we can avoid
    // calling `to_non_local()` here, which might let us avoid constructing a non-local cell for the
    // local task's return value. Flattening chains of `RawVc::LocalOutput` may still be useful to
    // reduce traversal later.
    output.try_into_raw_vc()?.to_non_local().await
}

macro_rules! task_fn_impl {
    ( $async_fn_trait:ident $arg_len:literal $( $arg:ident )* ) => {
        impl<F, Output, $($arg,)*> TaskFnInputFunction<FunctionMode, ($($arg,)*)> for F
        where
            $($arg: TaskInput + 'static,)*
            F: Fn($($arg,)*) -> Output + Send + Sync + Clone + 'static,
            Output: TaskOutput + 'static,
        {
            #[allow(non_snake_case)]
            fn functor(&self, arg: &dyn MagicAny) -> Result<NativeTaskFuture> {
                let task_fn = self.clone();
                let ($($arg,)*) = get_args::<($($arg,)*)>(arg)?;
                Ok(Box::pin(async move {
                    let output = (task_fn)($($arg,)*);
                    output_try_into_non_local_raw_vc(output).await
                }))
            }
        }

        impl<F, Output, FutureOutput, $($arg,)*> TaskFnInputFunction<AsyncFunctionMode, ($($arg,)*)> for F
        where
            $($arg: TaskInput + 'static,)*
            F: Fn($($arg,)*) -> FutureOutput + Send + Sync + Clone + 'static,
            FutureOutput: Future<Output = Output> + Send + 'static,
            Output: TaskOutput + 'static,
        {
            #[allow(non_snake_case)]
            fn functor(&self, arg: &dyn MagicAny) -> Result<NativeTaskFuture> {
                let task_fn = self.clone();
                let ($($arg,)*) = get_args::<($($arg,)*)>(arg)?;
                Ok(Box::pin(async move {
                    let output = (task_fn)($($arg,)*).await;
                    output_try_into_non_local_raw_vc(output).await
                }))
            }
        }

        impl<F, Output, Recv, $($arg,)*> TaskFnInputFunctionWithThis<MethodMode, Recv, ($($arg,)*)> for F
        where
            Recv: VcValueType,
            $($arg: TaskInput + 'static,)*
            F: Fn(&Recv, $($arg,)*) -> Output + Send + Sync + Clone + 'static,
            Output: TaskOutput + 'static,
        {
            #[allow(non_snake_case)]
            fn functor(&self, this: RawVc, arg: &dyn MagicAny) -> Result<NativeTaskFuture> {
                let task_fn = self.clone();
                let recv = Vc::<Recv>::from(this);
                let ($($arg,)*) = get_args::<($($arg,)*)>(arg)?;
                Ok(Box::pin(async move {
                    let recv = recv.await?;
                    let recv = <Recv::Read as VcRead<Recv>>::target_to_value_ref(&*recv);
                    let output = (task_fn)(recv, $($arg,)*);
                    output_try_into_non_local_raw_vc(output).await
                }))
            }
        }

        impl<F, Output, Recv, $($arg,)*> TaskFnInputFunctionWithThis<FunctionMode, Recv, ($($arg,)*)> for F
        where
            Recv: Sync + Send + 'static,
            $($arg: TaskInput + 'static,)*
            F: Fn(Vc<Recv>, $($arg,)*) -> Output + Send + Sync + Clone + 'static,
            Output: TaskOutput + 'static,
        {
            #[allow(non_snake_case)]
            fn functor(&self, this: RawVc, arg: &dyn MagicAny) -> Result<NativeTaskFuture> {
                let task_fn = self.clone();
                let recv = Vc::<Recv>::from(this);
                let ($($arg,)*) = get_args::<($($arg,)*)>(arg)?;
                Ok(Box::pin(async move {
                    let output = (task_fn)(recv, $($arg,)*);
                    output_try_into_non_local_raw_vc(output).await
                }))
            }
        }

        pub trait $async_fn_trait<A0, $($arg,)*>: Fn(A0, $($arg,)*) -> Self::OutputFuture {
            type OutputFuture: Future<Output = <Self as $async_fn_trait<A0, $($arg,)*>>::Output> + Send;
            type Output: TaskOutput;
        }

        impl<F: ?Sized, Fut, A0, $($arg,)*> $async_fn_trait<A0, $($arg,)*> for F
        where
            F: Fn(A0, $($arg,)*) -> Fut,
            Fut: Future + Send,
            Fut::Output: TaskOutput + 'static
        {
            type OutputFuture = Fut;
            type Output = Fut::Output;
        }

        impl<F, Recv, $($arg,)*> TaskFnInputFunctionWithThis<AsyncMethodMode, Recv, ($($arg,)*)> for F
        where
            Recv: VcValueType,
            $($arg: TaskInput + 'static,)*
            F: for<'a> $async_fn_trait<&'a Recv, $($arg,)*> + Clone + Send + Sync + 'static,
        {
            #[allow(non_snake_case)]
            fn functor(&self, this: RawVc, arg: &dyn MagicAny) -> Result<NativeTaskFuture> {
                let task_fn = self.clone();
                let recv = Vc::<Recv>::from(this);
                let ($($arg,)*) = get_args::<($($arg,)*)>(arg)?;
                Ok(Box::pin(async move {
                    let recv = recv.await?;
                    let recv = <Recv::Read as VcRead<Recv>>::target_to_value_ref(&*recv);
                    let output = (task_fn)(recv, $($arg,)*).await;
                    output_try_into_non_local_raw_vc(output).await
                }))
            }
        }

        impl<F, Recv, $($arg,)*> TaskFnInputFunctionWithThis<AsyncFunctionMode, Recv, ($($arg,)*)> for F
        where
            Recv: Sync + Send + 'static,
            $($arg: TaskInput + 'static,)*
            F: $async_fn_trait<Vc<Recv>, $($arg,)*> + Clone + Send + Sync + 'static,
        {
            #[allow(non_snake_case)]
            fn functor(&self, this: RawVc, arg: &dyn MagicAny) -> Result<NativeTaskFuture> {
                let task_fn = self.clone();
                let recv = Vc::<Recv>::from(this);
                let ($($arg,)*) = get_args::<($($arg,)*)>(arg)?;
                Ok(Box::pin(async move {
                    let output = (task_fn)(recv, $($arg,)*).await;
                    output_try_into_non_local_raw_vc(output).await
                }))
            }
        }
    };
}

task_fn_impl! { AsyncFn0 0 }
task_fn_impl! { AsyncFn1 1 A1 }
task_fn_impl! { AsyncFn2 2 A1 A2 }
task_fn_impl! { AsyncFn3 3 A1 A2 A3 }
task_fn_impl! { AsyncFn4 4 A1 A2 A3 A4 }
task_fn_impl! { AsyncFn5 5 A1 A2 A3 A4 A5 }
task_fn_impl! { AsyncFn6 6 A1 A2 A3 A4 A5 A6 }
task_fn_impl! { AsyncFn7 7 A1 A2 A3 A4 A5 A6 A7 }
task_fn_impl! { AsyncFn8 8 A1 A2 A3 A4 A5 A6 A7 A8 }
task_fn_impl! { AsyncFn9 9 A1 A2 A3 A4 A5 A6 A7 A8 A9 }
task_fn_impl! { AsyncFn10 10 A1 A2 A3 A4 A5 A6 A7 A8 A9 A10 }
task_fn_impl! { AsyncFn11 11 A1 A2 A3 A4 A5 A6 A7 A8 A9 A10 A11 }
task_fn_impl! { AsyncFn12 12 A1 A2 A3 A4 A5 A6 A7 A8 A9 A10 A11 A12 }

// There needs to be one more implementation than task_fn_impl to account for
// the receiver.
task_inputs_impl! {}
task_inputs_impl! { A1 }
task_inputs_impl! { A1 A2 }
task_inputs_impl! { A1 A2 A3 }
task_inputs_impl! { A1 A2 A3 A4 }
task_inputs_impl! { A1 A2 A3 A4 A5 }
task_inputs_impl! { A1 A2 A3 A4 A5 A6 }
task_inputs_impl! { A1 A2 A3 A4 A5 A6 A7 }
task_inputs_impl! { A1 A2 A3 A4 A5 A6 A7 A8 }
task_inputs_impl! { A1 A2 A3 A4 A5 A6 A7 A8 A9 }
task_inputs_impl! { A1 A2 A3 A4 A5 A6 A7 A8 A9 A10 }
task_inputs_impl! { A1 A2 A3 A4 A5 A6 A7 A8 A9 A10 A11 }
task_inputs_impl! { A1 A2 A3 A4 A5 A6 A7 A8 A9 A10 A11 A12 }
task_inputs_impl! { A1 A2 A3 A4 A5 A6 A7 A8 A9 A10 A11 A12 A13 }

#[cfg(test)]
mod tests {
    use turbo_rcstr::RcStr;

    use super::*;
    use crate::{ShrinkToFit, VcCellNewMode, VcDefaultRead};

    #[test]
    fn test_task_fn() {
        fn no_args() -> crate::Vc<i32> {
            todo!()
        }

        fn one_arg(_a: i32) -> crate::Vc<i32> {
            todo!()
        }

        async fn async_one_arg(_a: i32) -> crate::Vc<i32> {
            todo!()
        }

        fn with_recv(_a: &i32) -> crate::Vc<i32> {
            todo!()
        }

        async fn async_with_recv(_a: &i32) -> crate::Vc<i32> {
            todo!()
        }

        fn with_recv_and_str(_a: &i32, _s: RcStr) -> crate::Vc<i32> {
            todo!()
        }

        async fn async_with_recv_and_str(_a: &i32, _s: RcStr) -> crate::Vc<i32> {
            todo!()
        }

        async fn async_with_recv_and_str_and_result(_a: &i32, _s: RcStr) -> Result<crate::Vc<i32>> {
            todo!()
        }

        fn accepts_task_fn<F>(_task_fn: F)
        where
            F: TaskFn,
        {
        }

        struct Struct;
        impl Struct {
            async fn inherent_method(&self) {}
        }

        impl ShrinkToFit for Struct {
            fn shrink_to_fit(&mut self) {}
        }

        unsafe impl VcValueType for Struct {
            type Read = VcDefaultRead<Struct>;

            type CellMode = VcCellNewMode<Struct>;

            fn get_value_type_id() -> crate::ValueTypeId {
                todo!()
            }
        }

        trait AsyncTrait {
            async fn async_method(&self);
        }

        impl AsyncTrait for Struct {
            async fn async_method(&self) {
                todo!()
            }
        }

        /*
        async fn async_with_recv_and_str_and_lf(
            _a: &i32,
            _s: String,
        ) -> Result<crate::Vc<i32>, crate::Vc<i32>> {
            todo!()
        }

        #[async_trait::async_trait]
        trait BoxAsyncTrait {
            async fn box_async_method(&self);
        }

        #[async_trait::async_trait]
        impl BoxAsyncTrait for Struct {
            async fn box_async_method(&self) {
                todo!()
            }
        }
        */

        let _task_fn = no_args.into_task_fn();
        accepts_task_fn(no_args.into_task_fn());
        let _task_fn = one_arg.into_task_fn();
        accepts_task_fn(one_arg.into_task_fn());
        let _task_fn = async_one_arg.into_task_fn();
        accepts_task_fn(async_one_arg.into_task_fn());
        let task_fn = with_recv.into_task_fn_with_this();
        accepts_task_fn(task_fn);
        let task_fn = async_with_recv.into_task_fn_with_this();
        accepts_task_fn(task_fn);
        let task_fn = with_recv_and_str.into_task_fn_with_this();
        accepts_task_fn(task_fn);
        let task_fn = async_with_recv_and_str.into_task_fn_with_this();
        accepts_task_fn(task_fn);
        let task_fn = async_with_recv_and_str_and_result.into_task_fn_with_this();
        accepts_task_fn(task_fn);
        let task_fn = <Struct as AsyncTrait>::async_method.into_task_fn_with_this();
        accepts_task_fn(task_fn);
        let task_fn = Struct::inherent_method.into_task_fn_with_this();
        accepts_task_fn(task_fn);

        /*
        let task_fn = <Struct as BoxAsyncTrait>::box_async_method.into_task_fn();
        accepts_task_fn(task_fn);
        let task_fn = async_with_recv_and_str_and_lf.into_task_fn();
        accepts_task_fn(task_fn);
        */
    }
}
