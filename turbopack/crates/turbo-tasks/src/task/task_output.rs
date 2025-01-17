use std::marker::PhantomData;

use anyhow::Result;

use crate::{RawVc, Vc};

/// Trait to implement in order for a type to be accepted as a
/// `turbo_tasks::function` return type.
pub trait TaskOutput: Send {
    type Return;

    fn try_from_raw_vc(raw_vc: RawVc) -> Self::Return;
    fn try_into_raw_vc(self) -> Result<RawVc>;
}

impl<T> TaskOutput for Vc<T>
where
    T: Send + ?Sized,
{
    type Return = Vc<T>;

    fn try_from_raw_vc(raw_vc: RawVc) -> Self::Return {
        Vc {
            node: raw_vc,
            _t: PhantomData,
        }
    }

    fn try_into_raw_vc(self) -> Result<RawVc> {
        Ok(self.node)
    }
}

impl TaskOutput for () {
    type Return = Vc<()>;

    fn try_from_raw_vc(raw_vc: RawVc) -> Self::Return {
        raw_vc.into()
    }

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

    fn try_from_raw_vc(raw_vc: RawVc) -> Self::Return {
        T::try_from_raw_vc(raw_vc)
    }

    fn try_into_raw_vc(self) -> Result<RawVc> {
        self?.try_into_raw_vc()
    }
}
