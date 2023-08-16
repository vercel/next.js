use crate::{ValueDefault, Vc};

// TODO(alexkirsz) Should this be `#[turbo_tasks::function]` or is it okay to
// always return a new `Vc`?
pub fn unit() -> Vc<()> {
    Vc::cell(())
}

impl ValueDefault for () {
    // TODO(alexkirsz) Should this be `#[turbo_tasks::function]` or is it
    // preferrable to always return a new `Vc`?
    fn value_default() -> Vc<Self> {
        Vc::cell(())
    }
}
