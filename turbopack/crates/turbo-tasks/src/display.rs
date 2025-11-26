use turbo_rcstr::RcStr;
use turbo_tasks::Vc;

use crate::{self as turbo_tasks};

#[turbo_tasks::value_trait]
pub trait ValueToString {
    #[turbo_tasks::function]
    fn to_string(self: Vc<Self>) -> Vc<RcStr>;
}
