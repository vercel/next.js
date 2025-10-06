use postcard::ser_flavors::Flavor;

use crate::trace_writer::WriteGuard;

pub struct WriteGuardFlavor<'l> {
    pub guard: WriteGuard<'l>,
}

impl Flavor for WriteGuardFlavor<'_> {
    type Output = ();

    fn try_push(&mut self, data: u8) -> postcard::Result<()> {
        self.guard.push(data);
        Ok(())
    }

    fn finalize(self) -> postcard::Result<Self::Output> {
        Ok(())
    }

    fn try_extend(&mut self, data: &[u8]) -> postcard::Result<()> {
        self.guard.extend(data);
        Ok(())
    }
}
