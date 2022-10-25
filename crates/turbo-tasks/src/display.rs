use crate as turbo_tasks;
use crate::primitives::StringVc;

#[turbo_tasks::value_trait]
pub trait ValueToString {
    fn to_string(&self) -> StringVc;
}
