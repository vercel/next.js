use crate::{ResolvedVc, TaskInput, Vc};

// NOTE: If you add new implementations of this trait, you'll need to modify
// `expand_task_input_type` in `turbo-tasks-macros/src/func.rs`.
pub trait FromTaskInput: private::Sealed {
    type TaskInput: TaskInput;
    fn from_task_input(from: Self::TaskInput) -> Self;
}

mod private {
    use super::*;
    /// Implements the sealed trait pattern:
    /// <https://rust-lang.github.io/api-guidelines/future-proofing.html>
    pub trait Sealed {}
    impl<T> Sealed for ResolvedVc<T> where T: ?Sized {}
    impl<T> Sealed for Vec<T> where T: FromTaskInput {}
    impl<T> Sealed for Option<T> where T: FromTaskInput {}
}

impl<T> FromTaskInput for ResolvedVc<T>
where
    T: Send + Sync + ?Sized,
{
    type TaskInput = Vc<T>;
    fn from_task_input(from: Vc<T>) -> ResolvedVc<T> {
        debug_assert!(
            from.is_resolved(),
            "Outer `Vc`s are always resolved before this is called"
        );
        ResolvedVc { node: from }
    }
}

impl<T> FromTaskInput for Vec<T>
where
    T: FromTaskInput,
{
    type TaskInput = Vec<T::TaskInput>;
    fn from_task_input(from: Vec<T::TaskInput>) -> Vec<T> {
        let mut converted = Vec::with_capacity(from.len());
        for value in from {
            converted.push(T::from_task_input(value));
        }
        converted
    }
}

impl<T> FromTaskInput for Option<T>
where
    T: FromTaskInput,
{
    type TaskInput = Option<T::TaskInput>;
    fn from_task_input(from: Option<T::TaskInput>) -> Option<T> {
        from.map(T::from_task_input)
    }
}
