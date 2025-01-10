use turbo_rcstr::RcStr;
use turbo_tasks::Vc;

use crate::{self as turbo_tasks};

#[turbo_tasks::value_trait(local)]
pub trait ValueToString {
    fn to_string(self: Vc<Self>) -> Vc<RcStr>;
}
