<div align="center">
<img alt="lzzzz" src="lzzzz.png" height="80" />

Full-featured [liblz4](https://github.com/lz4/lz4) binding for Rust

[![Crates.io](https://img.shields.io/crates/v/lzzzz.svg)](https://crates.io/crates/lzzzz)
[![GitHub license](https://img.shields.io/github/license/picoHz/lzzzz.svg)](https://github.com/picoHz/lzzzz/blob/master/LICENSE)
[![Rustdoc](https://img.shields.io/badge/doc-rustdoc-green.svg)](https://docs.rs/lzzzz)
![Rust](https://github.com/picoHz/lzzzz/workflows/Rust/badge.svg)

</div>

---

## About

Rust APIs for the [LZ4](https://lz4.github.io/lz4/) compression algorithm.

- Supports almost all liblz4 features
- Zero dependencies except liblz4
- Tested on Windows / macOS / Linux

## Usage

Add this to your `Cargo.toml`:

```toml
[dependencies]
lzzzz = "1.0.3"
```

[API Documentation](https://docs.rs/lzzzz)

## Features

- LZ4
    - Compression (Block / Streaming)
    - Decompression (Block / Streaming)
    - Partial Decompression
    - Custom Dictionary
- LZ4_HC 
    - Compression (Block / Streaming)
    - Partial Compression
    - Custom Dictionary
- LZ4F 
    - Compression
    - Decompression
    - Custom Dictionary
    - Streaming I/O (`Read` / `BufRead` / `Write`)

## Examples

### Block Mode

```rust
use lzzzz::{lz4, lz4_hc, lz4f};

let data = b"The quick brown fox jumps over the lazy dog.";

// LZ4 compression
let mut comp = Vec::new();
lz4::compress_to_vec(data, &mut comp, lz4::ACC_LEVEL_DEFAULT)?;

// LZ4_HC compression
let mut comp = Vec::new();
lz4_hc::compress_to_vec(data, &mut comp, lz4_hc::CLEVEL_DEFAULT)?;

// LZ4/LZ4_HC decompression
let mut decomp = vec![0; data.len()];
lz4::decompress(&comp, &mut decomp)?;

// LZ4F compression
let prefs = lz4f::Preferences::default();
let mut comp = Vec::new();
lz4f::compress_to_vec(data, &mut comp, &prefs)?;

// LZ4F decompression
let mut decomp = Vec::new();
lz4f::decompress_to_vec(&comp, &mut decomp)?;
```

### Streaming Mode

```rust
use lzzzz::{lz4, lz4_hc};

let data = b"The quick brown fox jumps over the lazy dog.";

// LZ4 compression
let mut comp = lz4::Compressor::new()?;
let mut buf = Vec::new();
comp.next_to_vec(data, &mut buf, lz4::ACC_LEVEL_DEFAULT)?;

// LZ4_HC compression
let mut comp = lz4_hc::Compressor::new()?;
let mut buf = Vec::new();
comp.next_to_vec(data, &mut buf)?;

// LZ4/LZ4_HC decompression
let mut decomp = lz4::Decompressor::new()?;
let result = decomp.next(&data, data.len())?;
```

```rust
use lzzzz::lz4f::{WriteCompressor, ReadDecompressor, Preferences};
use std::{fs::File, io::prelude::*};

// LZ4F Write-based compression
let mut f = File::create("foo.lz4")?;
let mut w = WriteCompressor::new(&mut f, Preferences::default())?;
w.write_all(b"Hello world!")?;

// LZ4F Read-based decompression
let mut f = File::open("foo.lz4")?;
let mut r = ReadDecompressor::new(&mut f)?;
let mut buf = Vec::new();
r.read_to_end(&mut buf)?;
```
