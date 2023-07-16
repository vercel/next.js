use crate::Vc;

pub fn unit() -> Vc<()> {
    Vc::cell(())
}
