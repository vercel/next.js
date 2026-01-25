use std::marker::PhantomData;

use anyhow::Result;

use crate::{RawVc, Vc};

/// Trait to implement in order for a type to be accepted as a
/// `turbo_tasks::function` return type.
pub trait TaskOutput: Send {
    type Return: ?Sized;

    fn try_from_raw_vc(raw_vc: RawVc) -> Vc<Self::Return> {
        Vc {
            node: raw_vc,
            _t: PhantomData,
        }
    }
    fn try_into_raw_vc(self) -> Result<RawVc>;
}

impl<T> TaskOutput for Vc<T>
where
    T: Send + ?Sized,
{
    type Return = T;

    fn try_into_raw_vc(self) -> Result<RawVc> {
        Ok(self.node)
    }
}

impl TaskOutput for () {
    type Return = ();

    fn try_into_raw_vc(self) -> Result<RawVc> {
        let unit = Vc::<()>::default();
        Ok(unit.node)
    }
}

impl<T> TaskOutput for Result<T>
where
    T: TaskOutput,
{
    type Return = T::Return;

    fn try_into_raw_vc(self) -> Result<RawVc> {
        self?.try_into_raw_vc()
    }
}
