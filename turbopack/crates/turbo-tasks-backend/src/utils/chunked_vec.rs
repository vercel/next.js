pub struct ChunkedVec<T> {
    chunks: Vec<Vec<T>>,
}

impl<T> Default for ChunkedVec<T> {
    fn default() -> Self {
        Self::new()
    }
}

impl<T> ChunkedVec<T> {
    pub fn new() -> Self {
        Self { chunks: Vec::new() }
    }

    pub fn len(&self) -> usize {
        for (i, chunk) in self.chunks.iter().enumerate().rev() {
            if !chunk.is_empty() {
                let free = chunk.capacity() - chunk.len();
                return cummulative_chunk_size(i) - free;
            }
        }
        0
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

    pub fn extend<I: IntoIterator<Item = T>>(&mut self, iter: I) {
        for item in iter {
            self.push(item);
        }
    }

    pub fn iter(&self) -> impl Iterator<Item = &T> {
        ExactSizeIter {
            iter: self.chunks.iter().flat_map(|chunk| chunk.iter()),
            len: self.len(),
        }
    }

    pub fn is_empty(&self) -> bool {
        self.chunks.first().is_none_or(|chunk| chunk.is_empty())
    }
}

impl<T> IntoIterator for ChunkedVec<T> {
    type Item = T;
    type IntoIter = ExactSizeIter<std::iter::Flatten<std::vec::IntoIter<Vec<T>>>>;

    fn into_iter(self) -> Self::IntoIter {
        let len = self.len();
        ExactSizeIter {
            iter: self.chunks.into_iter().flatten(),
            len,
        }
    }
}

impl<T> Extend<T> for ChunkedVec<T> {
    fn extend<I: IntoIterator<Item = T>>(&mut self, iter: I) {
        for item in iter {
            self.push(item);
        }
    }
}

fn chunk_size(chunk_index: usize) -> usize {
    8 << chunk_index
}

fn cummulative_chunk_size(chunk_index: usize) -> usize {
    (8 << (chunk_index + 1)) - 8
}

pub struct ExactSizeIter<I: Iterator> {
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
