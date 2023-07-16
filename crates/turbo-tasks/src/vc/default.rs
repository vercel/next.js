use turbo_tasks::Vc;

use crate::{self as turbo_tasks};

#[turbo_tasks::value_trait]
pub trait ValueDefault {
    fn value_default() -> Vc<Self>;
}
