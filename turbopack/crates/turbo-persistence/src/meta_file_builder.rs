use std::{
    fs::File,
    io::{self, BufWriter, Write},
    path::Path,
};

use anyhow::{Context, Result};
use byteorder::{BE, WriteBytesExt};
use qfilter::Filter;

use crate::{meta_file::MetaFileFormat, static_sorted_file_builder::StaticSortedFileBuilderMeta};

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

        // Determine format type from first entry's flags
        let format = if let Some((_, first_entry)) = self.entries.first() {
            if first_entry.flags.uses_direct_keys() {
                if first_entry.flags.uses_fixed_values() {
                    MetaFileFormat::DirectFixed
                } else {
                    MetaFileFormat::DirectVariable
                }
            } else {
                MetaFileFormat::Hashed
            }
        } else {
            MetaFileFormat::Hashed // Default for empty meta files
        };

        // Write format byte
        file.write_u8(format as u8)?;

        self.obsolete_sst_files.sort();
        file.write_u32::<BE>(self.obsolete_sst_files.len() as u32)?;
        for obsolete_sst in &self.obsolete_sst_files {
            file.write_u32::<BE>(*obsolete_sst)?;
        }

        file.write_u32::<BE>(self.entries.len() as u32)?;

        match format {
            MetaFileFormat::Hashed => {
                self.write_hashed_entries(&mut file)?;
            }
            MetaFileFormat::DirectFixed => {
                self.write_direct_fixed_entries(&mut file)?;
            }
            MetaFileFormat::DirectVariable => {
                self.write_direct_variable_entries(&mut file)?;
            }
        }

        Ok(file.into_inner()?)
    }

    fn write_hashed_entries(self, file: &mut BufWriter<File>) -> io::Result<()> {
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
        Ok(())
    }

    fn write_direct_fixed_entries(&self, file: &mut BufWriter<File>) -> io::Result<()> {
        // Direct-fixed format: no AMQF, no compression dictionary
        // Entry: seq_num(4) + min_key(4) + max_key(4) + size(8) + flags(4) = 24 bytes
        for (sequence_number, sst) in &self.entries {
            file.write_u32::<BE>(*sequence_number)?;
            // Extract u32 key from the range value (stored in high 32 bits of u64)
            let min_key = (sst.min_hash >> 32) as u32;
            let max_key = (sst.max_hash >> 32) as u32;
            file.write_u32::<BE>(min_key)?;
            file.write_u32::<BE>(max_key)?;
            file.write_u64::<BE>(sst.size)?;
            file.write_u32::<BE>(sst.flags.0)?;
        }
        Ok(())
    }

    fn write_direct_variable_entries(&self, file: &mut BufWriter<File>) -> io::Result<()> {
        // Direct-variable format: no AMQF, no compression dictionary, but has block_count
        // Entry: seq_num(4) + min_key(4) + max_key(4) + size(8) + block_count(2) + flags(4) = 26
        // bytes
        for (sequence_number, sst) in &self.entries {
            file.write_u32::<BE>(*sequence_number)?;
            // Extract u32 key from the range value (stored in high 32 bits of u64)
            let min_key = (sst.min_hash >> 32) as u32;
            let max_key = (sst.max_hash >> 32) as u32;
            file.write_u32::<BE>(min_key)?;
            file.write_u32::<BE>(max_key)?;
            file.write_u64::<BE>(sst.size)?;
            file.write_u16::<BE>(sst.block_count)?;
            file.write_u32::<BE>(sst.flags.0)?;
        }
        Ok(())
    }
}
