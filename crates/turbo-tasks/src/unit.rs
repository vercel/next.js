use crate::Vc;

// TODO(alexkirsz) Should this be `#[turbo_tasks::function]` or is it okay to
// always return a new `Vc`?
#[deprecated(note = "use Default::default() instead")]
pub fn unit() -> Vc<()> {
    Vc::cell(())
}
