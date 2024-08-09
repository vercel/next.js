pub struct ChunkedVec<T> {
    chunks: Vec<Vec<T>>,
}

impl<T> ChunkedVec<T> {
    pub fn new() -> Self {
        Self { chunks: Vec::new() }
    }

    pub fn len(&self) -> usize {
        if let Some(last) = self.chunks.last() {
            let free = last.capacity() - self.len();
            cummulative_chunk_size(self.chunks.len() - 1) - free
        } else {
            0
        }
    }

    pub fn push(&mut self, item: T) {
        if let Some(chunk) = self.chunks.last_mut() {
            if chunk.len() < chunk.capacity() {
                chunk.push(item);
                return;
            }
        }
        let mut chunk = Vec::with_capacity(chunk_size(self.chunks.len()));
        chunk.push(item);
        self.chunks.push(chunk);
    }

    pub fn into_iter(self) -> impl Iterator<Item = T> {
        let len = self.len();
        ExactSizeIter {
            iter: self.chunks.into_iter().flat_map(|chunk| chunk.into_iter()),
            len,
        }
    }

    pub fn iter(&self) -> impl Iterator<Item = &T> {
        ExactSizeIter {
            iter: self.chunks.iter().flat_map(|chunk| chunk.iter()),
            len: self.len(),
        }
    }
}

fn chunk_size(chunk_index: usize) -> usize {
    8 << chunk_index
}

fn cummulative_chunk_size(chunk_index: usize) -> usize {
    (8 << (chunk_index + 1)) - 8
}

struct ExactSizeIter<I: Iterator> {
    iter: I,
    len: usize,
}

impl<I: Iterator> Iterator for ExactSizeIter<I> {
    type Item = I::Item;

    fn next(&mut self) -> Option<Self::Item> {
        self.iter.next().inspect(|_| self.len -= 1)
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        (self.len, Some(self.len))
    }
}

impl<I: Iterator> ExactSizeIterator for ExactSizeIter<I> {
    fn len(&self) -> usize {
        self.len
    }
}
