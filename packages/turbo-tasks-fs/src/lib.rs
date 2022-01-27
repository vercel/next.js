#[turbo_tasks::value]
struct FileSystem {
    name: String,
    root: String,
}

#[turbo_tasks::value_impl]
impl FileSystem {
    #[turbo_tasks::constructor]
    pub fn new(name: String, root: String) -> Self {
        Self { name, root }
    }
}

#[turbo_tasks::value]
struct FileSystemPath {
    fs: FileSystemRef,
    path: String,
}

#[turbo_tasks::value_impl]
impl FileSystemPath {
    #[turbo_tasks::constructor]
    pub fn new(fs: FileSystemRef, path: String) -> Self {
        Self { fs, path }
    }
}

#[turbo_tasks::value]
struct FileContent {
    buffer: Vec<u8>,
}

#[turbo_tasks::value_impl]
impl FileContent {
    #[turbo_tasks::constructor(!intern)]
    pub fn new(buffer: Vec<u8>) -> Self {
        Self { buffer }
    }
}

pub fn read(path: FileSystemPathRef) -> FileContentRef {
    // TODO
}
