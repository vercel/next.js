use std::{
    fs::File,
    io::{BufWriter, Write},
};

use anyhow::Result;
use byteorder::WriteBytesExt;

use crate::database::key_value_database::KeySpace;

pub const PAIR_HEADER_SIZE: usize = 9;

pub fn write_key_value_pair(
    writer: &mut BufWriter<File>,
    key_space: KeySpace,
    key: &[u8],
    value: &[u8],
) -> Result<usize> {
    writer.write_u8(match key_space {
        KeySpace::Infra => 0,
        KeySpace::TaskMeta => 1,
        KeySpace::TaskData => 2,
        KeySpace::ForwardTaskCache => 3,
        KeySpace::ReverseTaskCache => 4,
    })?;
    let key_len = key.len();
    writer.write_all(&(key_len as u32).to_be_bytes())?;
    let value_len = value.len();
    writer.write_all(&(value_len as u32).to_be_bytes())?;
    writer.write_all(key)?;
    writer.write_all(value)?;
    Ok(9 + key_len + value_len)
}

pub fn read_key_value_pair<'l>(
    buffer: &'l [u8],
    pos: &mut usize,
) -> Result<(KeySpace, &'l [u8], &'l [u8])> {
    let key_space = match buffer[*pos] {
        0 => KeySpace::Infra,
        1 => KeySpace::TaskMeta,
        2 => KeySpace::TaskData,
        3 => KeySpace::ForwardTaskCache,
        4 => KeySpace::ReverseTaskCache,
        _ => return Err(anyhow::anyhow!("Invalid key space")),
    };
    *pos += 1;
    let key_len = u32::from_be_bytes(buffer[*pos..*pos + 4].try_into()?);
    *pos += 4;
    let value_len = u32::from_be_bytes(buffer[*pos..*pos + 4].try_into()?);
    *pos += 4;
    let key = &buffer[*pos..*pos + key_len as usize];
    *pos += key_len as usize;
    let value = &buffer[*pos..*pos + value_len as usize];
    *pos += value_len as usize;
    Ok((key_space, key, value))
}
