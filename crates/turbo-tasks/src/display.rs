use crate::{self as turbo_tasks};

use crate::Promise;

#[turbo_tasks::value_trait]
pub trait ValueToString {
    fn to_string(&self) -> Promise<String>;
}
