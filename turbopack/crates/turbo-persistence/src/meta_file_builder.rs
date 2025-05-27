use std::{
    fs::File,
    io::{self, BufWriter, Write},
    path::Path,
};

use byteorder::{BE, WriteBytesExt};

use crate::static_sorted_file_builder::StaticSortedFileBuilderMetaResult;

pub struct MetaFileBuilder {
    family: u32,
    /// Entries in the meta file, tuples of (sequence_number, StaticSortedFileBuilderMetaResult)
    entries: Vec<(u32, StaticSortedFileBuilderMetaResult)>,
    /// Obsolete SST files, represented by their sequence numbers
    obsolete_sst_files: Vec<u32>,
}

impl MetaFileBuilder {
    pub fn new(family: u32) -> Self {
        Self {
            family,
            entries: Vec::new(),
            obsolete_sst_files: Vec::new(),
        }
    }

    pub fn add(&mut self, sequence_number: u32, sst: StaticSortedFileBuilderMetaResult) {
        self.entries.push((sequence_number, sst));
    }

    pub fn add_obsolete_sst_file(&mut self, sequence_number: u32) {
        self.obsolete_sst_files.push(sequence_number);
    }

    #[tracing::instrument(level = "trace", skip_all)]
    pub fn write(&self, file: &Path) -> io::Result<File> {
        let mut file = BufWriter::new(File::create(file)?);
        file.write_u32::<BE>(0x53535401)?; // Magic number
        file.write_u32::<BE>(self.family)?;

        file.write_u32::<BE>(self.obsolete_sst_files.len() as u32)?;
        for obsolete_sst in &self.obsolete_sst_files {
            file.write_u32::<BE>(*obsolete_sst)?;
        }

        file.write_u32::<BE>(self.entries.len() as u32)?;

        let mut aqmf_offset = 0;
        for (sequence_number, sst) in &self.entries {
            file.write_u32::<BE>(*sequence_number)?;
            file.write_u16::<BE>(sst.key_compression_dictionary_length)?;
            file.write_u16::<BE>(sst.value_compression_dictionary_length)?;
            file.write_u16::<BE>(sst.block_count)?;
            file.write_u64::<BE>(sst.min_hash)?;
            file.write_u64::<BE>(sst.max_hash)?;
            file.write_u64::<BE>(sst.size)?;
            aqmf_offset += sst.aqmf.len();
            file.write_u32::<BE>(aqmf_offset as u32)?;
        }

        for (_, sst) in &self.entries {
            file.write_all(&sst.aqmf)?;
        }
        Ok(file.into_inner()?)
    }
}
