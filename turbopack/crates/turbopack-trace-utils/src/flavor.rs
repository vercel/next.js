use postcard::ser_flavors::Flavor;

pub struct BufFlavor {
    pub buf: Vec<u8>,
}

impl Flavor for BufFlavor {
    type Output = Vec<u8>;

    fn try_push(&mut self, data: u8) -> postcard::Result<()> {
        self.buf.push(data);
        Ok(())
    }

    fn finalize(self) -> postcard::Result<Self::Output> {
        Ok(self.buf)
    }

    fn try_extend(&mut self, data: &[u8]) -> postcard::Result<()> {
        self.buf.extend_from_slice(data);
        Ok(())
    }
}
