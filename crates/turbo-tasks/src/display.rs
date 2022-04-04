use crate::{self as turbo_tasks};

use crate::Vc;

#[turbo_tasks::value_trait]
pub trait ValueToString {
    fn to_string(&self) -> Vc<String>;
}
