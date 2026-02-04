use std::{
    fs::File,
    io::{self, BufWriter, Write},
    path::Path,
};

use anyhow::{Context, Result};
use byteorder::{BE, WriteBytesExt};
use qfilter::Filter;

use crate::static_sorted_file_builder::StaticSortedFileBuilderMeta;

pub struct MetaFileBuilder<'a> {
    family: u32,
    /// Entries in the meta file, tuples of (sequence_number, StaticSortedFileBuilderMetaResult)
    entries: Vec<(u32, StaticSortedFileBuilderMeta<'a>)>,
    /// Obsolete SST files, represented by their sequence numbers
    obsolete_sst_files: Vec<u32>,
    /// Optional AMQF for used key hashes
    used_key_hashes_amqf: Option<Filter>,
}

impl<'a> MetaFileBuilder<'a> {
    pub fn new(family: u32) -> Self {
        Self {
            family,
            entries: Vec::new(),
            obsolete_sst_files: Vec::new(),
            used_key_hashes_amqf: None,
        }
    }

    pub fn add(&mut self, sequence_number: u32, sst: StaticSortedFileBuilderMeta<'a>) {
        self.entries.push((sequence_number, sst));
    }

    pub fn add_obsolete_sst_file(&mut self, sequence_number: u32) {
        self.obsolete_sst_files.push(sequence_number);
    }

    pub fn set_used_key_hashes_amqf(&mut self, amqf: Filter) {
        self.used_key_hashes_amqf = Some(amqf);
    }

    #[tracing::instrument(level = "trace", skip_all)]
    pub fn write(self, db_path: &Path, seq: u32) -> Result<File> {
        let file = db_path.join(format!("{seq:08}.meta"));
        self.write_internal(&file)
            .with_context(|| format!("Unable to write meta file {seq:08}.meta"))
    }

    fn write_internal(mut self, file: &Path) -> io::Result<File> {
        let mut file = BufWriter::new(File::create(file)?);
        file.write_u32::<BE>(0xFE4ADA4A)?; // Magic number
        file.write_u32::<BE>(self.family)?;

        self.obsolete_sst_files.sort();
        file.write_u32::<BE>(self.obsolete_sst_files.len() as u32)?;
        for obsolete_sst in &self.obsolete_sst_files {
            file.write_u32::<BE>(*obsolete_sst)?;
        }

        file.write_u32::<BE>(self.entries.len() as u32)?;

        let mut amqf_offset = 0;
        for (sequence_number, sst) in &self.entries {
            file.write_u32::<BE>(*sequence_number)?;
            file.write_u16::<BE>(sst.key_compression_dictionary_length)?;
            file.write_u16::<BE>(sst.block_count)?;
            file.write_u64::<BE>(sst.min_hash)?;
            file.write_u64::<BE>(sst.max_hash)?;
            file.write_u64::<BE>(sst.size)?;
            file.write_u32::<BE>(sst.flags.0)?;
            amqf_offset += sst.amqf.len();
            file.write_u32::<BE>(amqf_offset as u32)?;
        }
        let serialized_used_key_hashes = self
            .used_key_hashes_amqf
            .as_ref()
            .map(|f| pot::to_vec(f).expect("AMQF serialization failed"));
        amqf_offset += serialized_used_key_hashes
            .as_ref()
            .map(|bytes| bytes.len())
            .unwrap_or(0);
        file.write_u32::<BE>(amqf_offset as u32)?;

        for (_, sst) in &self.entries {
            file.write_all(&sst.amqf)?;
        }
        if let Some(bytes) = &serialized_used_key_hashes {
            file.write_all(bytes)?;
        }
        Ok(file.into_inner()?)
    }
}
