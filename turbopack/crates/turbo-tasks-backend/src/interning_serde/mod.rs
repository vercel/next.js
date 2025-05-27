//! Exposed for usage in `turbo-tasks-backend`

use std::io::Write;

use serde::{Deserialize, Serialize};
use turbo_rcstr::RcStr;
use turbo_tasks::FxIndexSet;

pub fn to_vec<T>(config: &pot::Config, value: &T) -> anyhow::Result<(Vec<u8>, RcStrToLocalId)>
where
    T: Serialize,
{
    let mut vec = Vec::new();
    let ser_map = to_writer(config, value, &mut vec)?;
    Ok((vec, ser_map))
}

pub struct LocalIdToRcStr(Vec<RcStr>);

impl From<Vec<RcStr>> for LocalIdToRcStr {
    fn from(value: Vec<RcStr>) -> Self {
        Self(value)
    }
}

#[derive(Default)]
pub struct RcStrToLocalId(FxIndexSet<RcStr>);

impl RcStrToLocalId {
    pub fn iter(&self) -> impl Iterator<Item = &RcStr> {
        self.0.iter()
    }
}

#[derive(Default)]
pub struct LocalIdToGlobalId(Vec<u32>);

impl From<Vec<u32>> for LocalIdToGlobalId {
    fn from(value: Vec<u32>) -> Self {
        Self(value)
    }
}

impl LocalIdToGlobalId {
    pub fn len(&self) -> usize {
        self.0.len()
    }

    pub fn iter(&self) -> impl '_ + Iterator<Item = u32> {
        self.0.iter().copied()
    }

    pub fn write_to(&self, writer: &mut impl Write) -> anyhow::Result<()> {
        let len = self.0.len() as u32;
        for id in self.0.iter().rev() {
            writer.write_all(&id.to_le_bytes())?;
        }

        writer.write_all(&len.to_le_bytes())?;

        Ok(())
    }

    pub fn read_from_slice(mut bytes: &[u8]) -> anyhow::Result<(Self, &[u8])> {
        let mut global_ids = Vec::new();

        // Length is the last 4 bytes
        let len = u32::from_le_bytes(bytes[bytes.len() - 4..].try_into().unwrap());
        global_ids.reserve(len as usize);

        bytes = &bytes[..bytes.len() - 4];

        // Read the ids in reverse order
        for _ in 0..len {
            let id = u32::from_le_bytes(bytes[bytes.len() - 4..].try_into().unwrap());
            global_ids.push(id);
            bytes = &bytes[..bytes.len() - 4];
        }

        Ok((Self(global_ids), bytes))
    }
}

pub fn to_writer<T, W>(config: &pot::Config, value: &T, writer: W) -> anyhow::Result<RcStrToLocalId>
where
    T: Serialize,
    W: Write,
{
    let (result, ser_map) = turbo_rcstr::set_ser_map(|| config.serialize_into(value, writer));
    result?;

    Ok(RcStrToLocalId(ser_map))
}

pub fn from_slice<'de, T>(
    config: &pot::Config,
    bytes: &'de [u8],
    de_map: &LocalIdToRcStr,
) -> anyhow::Result<T>
where
    T: Deserialize<'de>,
{
    turbo_rcstr::set_de_map(&de_map.0, || Ok(config.deserialize(bytes)?))
}
