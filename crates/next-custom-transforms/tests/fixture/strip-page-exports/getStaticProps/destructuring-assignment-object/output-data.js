import fs from 'fs';
import other from 'other';
const { readFile , readdir , access: foo  } = fs.promises;
const { a , b , cat: bar , ...rem } = other;
export async function getStaticProps() {
    readFile;
    readdir;
    foo;
    b;
    cat;
    rem;
}
