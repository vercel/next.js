use std::{
    borrow::Cow,
    fs::{create_dir_all, File},
    io::BufWriter,
    path::PathBuf,
};

use anyhow::{Context, Result};

use crate::database::{
    key_value_database::{KeySpace, KeyValueDatabase, WriteBatch},
    rw_pair::{write_key_value_pair, PAIR_HEADER_SIZE},
};

pub struct DumpKeyValueDatabase {
    path: PathBuf,
}

impl DumpKeyValueDatabase {
    pub fn new(path: PathBuf) -> Result<Self> {
        create_dir_all(&path).context("Creating database directory failed")?;

        Ok(Self { path })
    }
}

impl KeyValueDatabase for DumpKeyValueDatabase {
    type ReadTransaction<'l>
        = ()
    where
        Self: 'l;

    fn lower_read_transaction<'l: 'i + 'r, 'i: 'r, 'r>(
        tx: &'r Self::ReadTransaction<'l>,
    ) -> &'r Self::ReadTransaction<'i> {
        tx
    }

    fn begin_read_transaction(&self) -> Result<Self::ReadTransaction<'_>> {
        Ok(())
    }

    type ValueBuffer<'l>
        = &'l [u8]
    where
        Self: 'l;

    fn get<'l, 'db: 'l>(
        &'l self,
        _transaction: &'l Self::ReadTransaction<'db>,
        _key_space: KeySpace,
        _key: &[u8],
    ) -> Result<Option<Self::ValueBuffer<'l>>> {
        Ok(None)
    }

    type WriteBatch<'l>
        = DumpWriteBatch<'l>
    where
        Self: 'l;

    fn write_batch(&self) -> Result<Self::WriteBatch<'_>> {
        Ok(DumpWriteBatch {
            current_file: BufWriter::new(File::create(&self.path.join("0"))?),
            current_file_size: 0,
            current_file_index: 0,
            path: &self.path,
        })
    }
}

const MAX_FILE_SIZE: usize = 100 * 1024 * 1024;

pub struct DumpWriteBatch<'a> {
    current_file: BufWriter<File>,
    current_file_size: usize,
    current_file_index: usize,
    path: &'a Path,
}

impl<'a> DumpWriteBatch<'a> {
    fn reserve_size(&mut self, size: usize) -> Result<()> {
        self.current_file_size += size;
        if self.current_file_size > MAX_FILE_SIZE {
            self.current_file_index += 1;
            self.current_file = BufWriter::new(File::create(
                &self.path.join(self.current_file_index.to_string()),
            )?);
            self.current_file_size = size;
        }
        Ok(())
    }
}

impl<'a> WriteBatch<'a> for DumpWriteBatch<'a> {
    type ValueBuffer<'l>
        = &'l [u8]
    where
        Self: 'l;

    fn get<'l>(&'l self, _key_space: KeySpace, _key: &[u8]) -> Result<Option<Self::ValueBuffer<'l>>>
    where
        'a: 'l,
    {
        Ok(None)
    }

    fn put(&mut self, key_space: KeySpace, key: Cow<[u8]>, value: Cow<[u8]>) -> Result<()> {
        self.reserve_size(key.len() + value.len() + PAIR_HEADER_SIZE)?;
        write_key_value_pair(&mut self.current_file, key_space, &key, &value)?;
        Ok(())
    }

    fn delete(&mut self, key_space: KeySpace, key: Cow<[u8]>) -> Result<()> {
        self.reserve_size(key.len() + PAIR_HEADER_SIZE)?;
        write_key_value_pair(&mut self.current_file, key_space, &key, &[])?;
        Ok(())
    }

    fn commit(self) -> Result<()> {
        Ok(())
    }
}
