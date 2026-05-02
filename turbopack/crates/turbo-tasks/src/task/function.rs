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

use std::{future::Future, marker::PhantomData, pin::Pin, sync::Arc};

use anyhow::Result;

use super::{TaskInput, TaskOutput};
use crate::{
    RawVc, Vc, VcRead, VcValueType, backend::CachedTaskType, native_function::downcast_args_ref,
};

pub type NativeTaskFuture = Pin<Box<dyn Future<Output = Result<RawVc>> + Send>>;

pub trait TaskFn: Send + Sync + 'static {
    fn functor(&self, task: Arc<CachedTaskType>) -> Result<NativeTaskFuture>;
}

/// A trait for `TaskFn` implementations that allows task inputs to be extracted as a type.
pub trait TaskFnInputs: TaskFn {
    type INPUTS: TaskInput + TaskInputs;
}

pub const fn into_task_fn<
    Mode: TaskFnMode,
    Inputs: TaskInputs,
    F: TaskFnInputFunction<Mode, Inputs>,
>(
    f: F,
) -> FunctionTaskFn<F, Mode, Inputs> {
    FunctionTaskFn {
        task_fn: f,
        mode: PhantomData,
        inputs: PhantomData,
    }
}

pub const fn into_task_fn_with_this<
    Mode: TaskFnMode,
    This: Send + Sync + 'static,
    Inputs: TaskInputs,
    F: TaskFnInputFunctionWithThis<Mode, This, Inputs>,
>(
    f: F,
) -> FunctionTaskFnWithThis<F, Mode, This, Inputs> {
    FunctionTaskFnWithThis {
        task_fn: f,
        mode: PhantomData,
        this: PhantomData,
        inputs: PhantomData,
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
    fn functor(&self, task: Arc<CachedTaskType>) -> Result<NativeTaskFuture> {
        TaskFnInputFunction::functor(&self.task_fn, task)
    }
}

impl<F, Mode, Inputs> TaskFnInputs for FunctionTaskFn<F, Mode, Inputs>
where
    F: TaskFnInputFunction<Mode, Inputs>,
    Mode: TaskFnMode,
    Inputs: TaskInputs + TaskInput,
{
    type INPUTS = Inputs;
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
    fn functor(&self, task: Arc<CachedTaskType>) -> Result<NativeTaskFuture> {
        let Some(this) = task.this else {
            panic!("Method needs a `self` argument");
        };
        TaskFnInputFunctionWithThis::functor(&self.task_fn, this, task)
    }
}

impl<F, Mode, This, Inputs> TaskFnInputs for FunctionTaskFnWithThis<F, Mode, This, Inputs>
where
    F: TaskFnInputFunctionWithThis<Mode, This, Inputs>,
    Mode: TaskFnMode,
    This: Sync + Send + 'static,
    Inputs: TaskInputs + TaskInput,
{
    type INPUTS = Inputs;
}

#[doc(hidden)]
pub trait TaskFnInputFunction<Mode: TaskFnMode, Inputs: TaskInputs>:
    Send + Sync + Clone + 'static
{
    fn functor(&self, task: Arc<CachedTaskType>) -> Result<NativeTaskFuture>;
}

#[doc(hidden)]
pub trait TaskFnInputFunctionWithThis<
    Mode: TaskFnMode,
    This: Sync + Send + 'static,
    Inputs: TaskInputs,
>: Send + Sync + Clone + 'static
{
    fn functor(&self, this: RawVc, task: Arc<CachedTaskType>) -> Result<NativeTaskFuture>;
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

// Helper function for `task_fn_impl!()`
async fn output_try_into_non_local_raw_vc(output: impl TaskOutput) -> Result<RawVc> {
    output.try_into_raw_vc()?.to_non_local().await
}

// Defines the `AsyncFnN<A0, A1, ..., AN>` helper trait used to express async-fn bounds with
// associated future types. Needed so `for<'a> $async_fn_trait<&'a A, ...>` HRTBs work without
// fixing a single concrete `Fut` (each lifetime can produce a different one).
macro_rules! def_async_fn_trait {
    ( $async_fn_trait:ident $( $arg:ident )* ) => {
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
    };
}

def_async_fn_trait! { AsyncFn0 }
def_async_fn_trait! { AsyncFn1  A1 }
def_async_fn_trait! { AsyncFn2  A1 A2 }
def_async_fn_trait! { AsyncFn3  A1 A2 A3 }
def_async_fn_trait! { AsyncFn4  A1 A2 A3 A4 }
def_async_fn_trait! { AsyncFn5  A1 A2 A3 A4 A5 }
def_async_fn_trait! { AsyncFn6  A1 A2 A3 A4 A5 A6 }
def_async_fn_trait! { AsyncFn7  A1 A2 A3 A4 A5 A6 A7 }
def_async_fn_trait! { AsyncFn8  A1 A2 A3 A4 A5 A6 A7 A8 }
def_async_fn_trait! { AsyncFn9  A1 A2 A3 A4 A5 A6 A7 A8 A9 }
def_async_fn_trait! { AsyncFn10 A1 A2 A3 A4 A5 A6 A7 A8 A9 A10 }
def_async_fn_trait! { AsyncFn11 A1 A2 A3 A4 A5 A6 A7 A8 A9 A10 A11 }
def_async_fn_trait! { AsyncFn12 A1 A2 A3 A4 A5 A6 A7 A8 A9 A10 A11 A12 }

// Arity-0 by-value blanket impls. These cover functions with no user arguments — only the
// receiver, if any. With zero user args there is nothing to wrap as `&T`, so the by-value form
// is the only sensible shape and is also what the `#[turbo_tasks::function]` macro emits for
// these cases. The arity-≥1 forms in `task_fn_impl!` below always take user args by reference.
mod arity_zero {
    use super::*;

    impl<F, Output> TaskFnInputFunction<FunctionMode, ()> for F
    where
        F: Fn() -> Output + Send + Sync + Clone + 'static,
        Output: TaskOutput + 'static,
    {
        fn functor(&self, _task: Arc<CachedTaskType>) -> Result<NativeTaskFuture> {
            let task_fn = self.clone();
            Ok(Box::pin(async move {
                let output = (task_fn)();
                output_try_into_non_local_raw_vc(output).await
            }))
        }
    }

    impl<F, Output, FutureOutput> TaskFnInputFunction<AsyncFunctionMode, ()> for F
    where
        F: Fn() -> FutureOutput + Send + Sync + Clone + 'static,
        FutureOutput: Future<Output = Output> + Send + 'static,
        Output: TaskOutput + 'static,
    {
        fn functor(&self, _task: Arc<CachedTaskType>) -> Result<NativeTaskFuture> {
            let task_fn = self.clone();
            Ok(Box::pin(async move {
                let output = (task_fn)().await;
                output_try_into_non_local_raw_vc(output).await
            }))
        }
    }

    impl<F, Output, Recv> TaskFnInputFunctionWithThis<MethodMode, Recv, ()> for F
    where
        Recv: VcValueType,
        F: Fn(&Recv) -> Output + Send + Sync + Clone + 'static,
        Output: TaskOutput + 'static,
    {
        fn functor(&self, this: RawVc, _task: Arc<CachedTaskType>) -> Result<NativeTaskFuture> {
            let task_fn = self.clone();
            let recv = Vc::<Recv>::from(this);
            Ok(Box::pin(async move {
                let recv = recv.await?;
                let recv = <Recv::Read as VcRead<Recv>>::target_to_value_ref(&*recv);
                (task_fn)(recv).try_into_raw_vc()
            }))
        }
    }

    impl<F, Output, Recv> TaskFnInputFunctionWithThis<FunctionMode, Recv, ()> for F
    where
        Recv: Sync + Send + 'static,
        F: Fn(Vc<Recv>) -> Output + Send + Sync + Clone + 'static,
        Output: TaskOutput + 'static,
    {
        fn functor(&self, this: RawVc, _task: Arc<CachedTaskType>) -> Result<NativeTaskFuture> {
            let task_fn = self.clone();
            let recv = Vc::<Recv>::from(this);
            Ok(Box::pin(async move { (task_fn)(recv).try_into_raw_vc() }))
        }
    }

    impl<F, Recv> TaskFnInputFunctionWithThis<AsyncMethodMode, Recv, ()> for F
    where
        Recv: VcValueType,
        F: for<'a> AsyncFn0<&'a Recv> + Clone + Send + Sync + 'static,
    {
        fn functor(&self, this: RawVc, _task: Arc<CachedTaskType>) -> Result<NativeTaskFuture> {
            let task_fn = self.clone();
            let recv = Vc::<Recv>::from(this);
            Ok(Box::pin(async move {
                let recv = recv.await?;
                let recv = <Recv::Read as VcRead<Recv>>::target_to_value_ref(&*recv);
                (task_fn)(recv).await.try_into_raw_vc()
            }))
        }
    }

    impl<F, Recv> TaskFnInputFunctionWithThis<AsyncFunctionMode, Recv, ()> for F
    where
        Recv: Sync + Send + 'static,
        F: AsyncFn0<Vc<Recv>> + Clone + Send + Sync + 'static,
    {
        fn functor(&self, this: RawVc, _task: Arc<CachedTaskType>) -> Result<NativeTaskFuture> {
            let task_fn = self.clone();
            let recv = Vc::<Recv>::from(this);
            Ok(Box::pin(
                async move { (task_fn)(recv).await.try_into_raw_vc() },
            ))
        }
    }
}

// Arity-≥1 by-reference blanket impls. Every macro-generated inline function with one or more
// user arguments lands here: the macro rewrites each owned `T` into `&T` (and inserts a clone
// shadow if the body needs ownership), so the inline closure is `Fn(&Recv?, &A1, ..., &AN)`.
// The async block captures `task: Arc<CachedTaskType>` so that references downcast out of
// `&*task.arg` remain valid for the entire future.
//
// Distinct `Inputs` tuples (unit `()` vs `(A1, ..., AN)`) keep these impls non-overlapping with
// the arity-zero impls above, even though they share the same `Mode` markers.
//
// `$async_fn_trait_with_recv` has arity `1 + arg_len` (one slot for the receiver, plus one per
// user arg) — used by the with-this async impls. `$async_fn_trait_no_recv` has arity `arg_len`
// and is used by the non-method async impl.
macro_rules! task_fn_impl {
    (
        $async_fn_trait_with_recv:ident
        $async_fn_trait_no_recv:ident
        $arg_len:literal
        $arg1:ident $($arg:ident)*
    ) => {
        impl<F, Output, $arg1, $($arg,)*> TaskFnInputFunction<FunctionMode, ($arg1, $($arg,)*)> for F
        where
            $arg1: TaskInput + 'static,
            $($arg: TaskInput + 'static,)*
            F: for<'a> Fn(&'a $arg1, $(&'a $arg,)*) -> Output + Send + Sync + Clone + 'static,
            Output: TaskOutput + 'static,
        {
            #[allow(non_snake_case)]
            fn functor(&self, task: Arc<CachedTaskType>) -> Result<NativeTaskFuture> {
                let task_fn = self.clone();
                Ok(Box::pin(async move {
                    let ($arg1, $($arg,)*) = downcast_args_ref::<($arg1, $($arg,)*)>(&*task.arg);
                    (task_fn)($arg1, $($arg,)*).try_into_raw_vc()
                }))
            }
        }

        impl<F, $arg1, $($arg,)*> TaskFnInputFunction<AsyncFunctionMode, ($arg1, $($arg,)*)> for F
        where
            $arg1: TaskInput + 'static,
            $($arg: TaskInput + 'static,)*
            F: for<'a> $async_fn_trait_no_recv<&'a $arg1, $(&'a $arg,)*>
                + Clone + Send + Sync + 'static,
        {
            #[allow(non_snake_case)]
            fn functor(&self, task: Arc<CachedTaskType>) -> Result<NativeTaskFuture> {
                let task_fn = self.clone();
                Ok(Box::pin(async move {
                    let ($arg1, $($arg,)*) = downcast_args_ref::<($arg1, $($arg,)*)>(&*task.arg);
                    (task_fn)($arg1, $($arg,)*).await.try_into_raw_vc()
                }))
            }
        }

        impl<F, Output, Recv, $arg1, $($arg,)*>
            TaskFnInputFunctionWithThis<MethodMode, Recv, ($arg1, $($arg,)*)> for F
        where
            Recv: VcValueType,
            $arg1: TaskInput + 'static,
            $($arg: TaskInput + 'static,)*
            F: for<'a> Fn(&'a Recv, &'a $arg1, $(&'a $arg,)*) -> Output
                + Send + Sync + Clone + 'static,
            Output: TaskOutput + 'static,
        {
            #[allow(non_snake_case)]
            fn functor(&self, this: RawVc, task: Arc<CachedTaskType>) -> Result<NativeTaskFuture> {
                let task_fn = self.clone();
                let recv = Vc::<Recv>::from(this);
                Ok(Box::pin(async move {
                    let recv = recv.await?;
                    let recv = <Recv::Read as VcRead<Recv>>::target_to_value_ref(&*recv);
                    let ($arg1, $($arg,)*) = downcast_args_ref::<($arg1, $($arg,)*)>(&*task.arg);
                    (task_fn)(recv, $arg1, $($arg,)*).try_into_raw_vc()
                }))
            }
        }

        impl<F, Output, Recv, $arg1, $($arg,)*>
            TaskFnInputFunctionWithThis<FunctionMode, Recv, ($arg1, $($arg,)*)> for F
        where
            Recv: Sync + Send + 'static,
            $arg1: TaskInput + 'static,
            $($arg: TaskInput + 'static,)*
            F: for<'a> Fn(Vc<Recv>, &'a $arg1, $(&'a $arg,)*) -> Output
                + Send + Sync + Clone + 'static,
            Output: TaskOutput + 'static,
        {
            #[allow(non_snake_case)]
            fn functor(&self, this: RawVc, task: Arc<CachedTaskType>) -> Result<NativeTaskFuture> {
                let task_fn = self.clone();
                let recv = Vc::<Recv>::from(this);
                Ok(Box::pin(async move {
                    let ($arg1, $($arg,)*) = downcast_args_ref::<($arg1, $($arg,)*)>(&*task.arg);
                    (task_fn)(recv, $arg1, $($arg,)*).try_into_raw_vc()
                }))
            }
        }

        impl<F, Recv, $arg1, $($arg,)*>
            TaskFnInputFunctionWithThis<AsyncMethodMode, Recv, ($arg1, $($arg,)*)> for F
        where
            Recv: VcValueType,
            $arg1: TaskInput + 'static,
            $($arg: TaskInput + 'static,)*
            F: for<'a> $async_fn_trait_with_recv<&'a Recv, &'a $arg1, $(&'a $arg,)*>
                + Clone + Send + Sync + 'static,
        {
            #[allow(non_snake_case)]
            fn functor(&self, this: RawVc, task: Arc<CachedTaskType>) -> Result<NativeTaskFuture> {
                let task_fn = self.clone();
                let recv = Vc::<Recv>::from(this);
                Ok(Box::pin(async move {
                    let recv = recv.await?;
                    let recv = <Recv::Read as VcRead<Recv>>::target_to_value_ref(&*recv);
                    let ($arg1, $($arg,)*) = downcast_args_ref::<($arg1, $($arg,)*)>(&*task.arg);
                    (task_fn)(recv, $arg1, $($arg,)*).await.try_into_raw_vc()
                }))
            }
        }

        impl<F, Recv, $arg1, $($arg,)*>
            TaskFnInputFunctionWithThis<AsyncFunctionMode, Recv, ($arg1, $($arg,)*)> for F
        where
            Recv: Sync + Send + 'static,
            $arg1: TaskInput + 'static,
            $($arg: TaskInput + 'static,)*
            F: for<'a> $async_fn_trait_with_recv<Vc<Recv>, &'a $arg1, $(&'a $arg,)*>
                + Clone + Send + Sync + 'static,
        {
            #[allow(non_snake_case)]
            fn functor(&self, this: RawVc, task: Arc<CachedTaskType>) -> Result<NativeTaskFuture> {
                let task_fn = self.clone();
                let recv = Vc::<Recv>::from(this);
                Ok(Box::pin(async move {
                    let ($arg1, $($arg,)*) = downcast_args_ref::<($arg1, $($arg,)*)>(&*task.arg);
                    (task_fn)(recv, $arg1, $($arg,)*).await.try_into_raw_vc()
                }))
            }
        }
    };
}

task_fn_impl! { AsyncFn1  AsyncFn0  1  A1 }
task_fn_impl! { AsyncFn2  AsyncFn1  2  A1 A2 }
task_fn_impl! { AsyncFn3  AsyncFn2  3  A1 A2 A3 }
task_fn_impl! { AsyncFn4  AsyncFn3  4  A1 A2 A3 A4 }
task_fn_impl! { AsyncFn5  AsyncFn4  5  A1 A2 A3 A4 A5 }
task_fn_impl! { AsyncFn6  AsyncFn5  6  A1 A2 A3 A4 A5 A6 }
task_fn_impl! { AsyncFn7  AsyncFn6  7  A1 A2 A3 A4 A5 A6 A7 }
task_fn_impl! { AsyncFn8  AsyncFn7  8  A1 A2 A3 A4 A5 A6 A7 A8 }
task_fn_impl! { AsyncFn9  AsyncFn8  9  A1 A2 A3 A4 A5 A6 A7 A8 A9 }
task_fn_impl! { AsyncFn10 AsyncFn9  10 A1 A2 A3 A4 A5 A6 A7 A8 A9 A10 }
task_fn_impl! { AsyncFn11 AsyncFn10 11 A1 A2 A3 A4 A5 A6 A7 A8 A9 A10 A11 }
task_fn_impl! { AsyncFn12 AsyncFn11 12 A1 A2 A3 A4 A5 A6 A7 A8 A9 A10 A11 A12 }

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
        // Arity-zero non-method: covers `FunctionMode` and `AsyncFunctionMode` for empty
        // `Inputs = ()`. These are the only blanket impls without a by-ref shape — there are no
        // user arguments to take by reference.
        fn no_args() -> crate::Vc<i32> {
            todo!()
        }

        async fn async_no_args() -> crate::Vc<i32> {
            todo!()
        }

        // Arity-one non-method: the inline closure that the macro generates always takes user
        // args by reference, so the blanket impl for arity ≥ 1 expects `Fn(&A1) -> _`.
        fn one_arg(_a: &i32) -> crate::Vc<i32> {
            todo!()
        }

        async fn async_one_arg(_a: &i32) -> crate::Vc<i32> {
            todo!()
        }

        // Arity-zero method (just the receiver, no user args): goes through the by-value
        // `MethodMode` / `AsyncMethodMode` impls.
        fn with_recv(_a: &i32) -> crate::Vc<i32> {
            todo!()
        }

        async fn async_with_recv(_a: &i32) -> crate::Vc<i32> {
            todo!()
        }

        // Method + one user arg, both by reference. The macro-generated inline always looks like
        // this when the user writes either a by-value or a by-ref non-Vc argument.
        fn with_recv_and_str(_a: &i32, _s: &RcStr) -> crate::Vc<i32> {
            todo!()
        }

        async fn async_with_recv_and_str(_a: &i32, _s: &RcStr) -> crate::Vc<i32> {
            todo!()
        }

        async fn async_with_recv_and_str_and_result(
            _a: &i32,
            _s: &RcStr,
        ) -> Result<crate::Vc<i32>> {
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

            // By-ref method: &Recv plus one &T arg, sync.
            fn inherent_method_with_ref_arg(&self, _a: &i32) -> crate::Vc<i32> {
                todo!()
            }

            // By-ref method: &Recv plus one &T arg, async.
            async fn inherent_async_method_with_ref_arg(&self, _a: &i32) -> crate::Vc<i32> {
                todo!()
            }

            // By-ref method: Vc<Recv> receiver plus one &T arg, sync.
            fn function_mode_with_ref_arg(self: crate::Vc<Self>, _a: &i32) -> crate::Vc<i32> {
                todo!()
            }
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

            fn has_serialization() -> bool {
                false
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

        // Arity-zero, no receiver.
        let task_fn = into_task_fn(no_args);
        accepts_task_fn(task_fn);
        let task_fn = into_task_fn(async_no_args);
        accepts_task_fn(task_fn);

        // Arity-one, no receiver — by-ref blanket impl.
        let task_fn = into_task_fn(one_arg);
        accepts_task_fn(task_fn);
        let task_fn = into_task_fn(async_one_arg);
        accepts_task_fn(task_fn);

        // Methods with no user args — by-value blanket impls.
        let task_fn = into_task_fn_with_this(with_recv);
        accepts_task_fn(task_fn);
        let task_fn = into_task_fn_with_this(async_with_recv);
        accepts_task_fn(task_fn);
        let task_fn = into_task_fn_with_this(<Struct as AsyncTrait>::async_method);
        accepts_task_fn(task_fn);
        let task_fn = into_task_fn_with_this(Struct::inherent_method);
        accepts_task_fn(task_fn);

        // Methods with at least one user arg — by-ref blanket impls.
        let task_fn = into_task_fn_with_this(with_recv_and_str);
        accepts_task_fn(task_fn);
        let task_fn = into_task_fn_with_this(async_with_recv_and_str);
        accepts_task_fn(task_fn);
        let task_fn = into_task_fn_with_this(async_with_recv_and_str_and_result);
        accepts_task_fn(task_fn);
        let task_fn = into_task_fn_with_this(Struct::inherent_method_with_ref_arg);
        accepts_task_fn(task_fn);
        let task_fn = into_task_fn_with_this(Struct::inherent_async_method_with_ref_arg);
        accepts_task_fn(task_fn);
        let task_fn = into_task_fn_with_this(Struct::function_mode_with_ref_arg);
        accepts_task_fn(task_fn);

        /*
        let task_fn = <Struct as BoxAsyncTrait>::box_async_method.into_task_fn();
        accepts_task_fn(task_fn);
        let task_fn = async_with_recv_and_str_and_lf.into_task_fn();
        accepts_task_fn(task_fn);
        */
    }
}
