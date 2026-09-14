fn main() -> Result<(), cc::Error> {
    let sources = &["lz4.c", "lz4hc.c", "lz4frame.c", "xxhash.c"][..];
    let dir = std::path::Path::new("vendor/liblz4");
    cc::Build::new()
        .files(sources.iter().map(|file| dir.join(file)))
        .try_compile("lz4")
}
