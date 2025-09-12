#!/usr/bin/env node
// Simple safe refactor script that replaces deep relative imports (../.. and deeper)
// with the '@/...' alias, but only when the resolved target is inside the example root.
// Usage: node scripts/replace-imports.js

const fs = require('fs');
const path = require('path');

const exampleRoot = path.resolve(__dirname, '..');

function isInsideExample(resolvedPath) {
  const rel = path.relative(exampleRoot, resolvedPath);
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

function processFile(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  const importRegex = /from\s+['\"](\.\.\/){2,}([^'\"]+)['\"]/g;
  let match;
  let updated = src;
  let changed = false;

  while ((match = importRegex.exec(src)) !== null) {
    const fullMatch = match[0];
    const ups = match[1];
    const rest = match[2];

    // compute resolved path
    const dir = path.dirname(filePath);
    const relativePath = ups.replace(/(\.\.\/)$/, '') + rest; // keep trailing
    const resolved = path.resolve(dir, match[0].match(/['\"](.*)['\"]/)[1]);

    if (isInsideExample(resolved)) {
      const newImport = `from "@/${rest}"`;
      updated = updated.replace(fullMatch, newImport);
      changed = true;
      console.log(`Updated import in ${filePath}: ${fullMatch} -> ${newImport}`);
    } else {
      console.log(`Skipped import in ${filePath} -> target outside example: ${match[0]}`);
    }
  }

  if (changed) {
    // backup
    fs.copyFileSync(filePath, filePath + '.bak');
    fs.writeFileSync(filePath, updated, 'utf8');
  }
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      walk(full);
    } else if (/\.(js|ts|jsx|tsx)$/.test(entry.name)) {
      processFile(full);
    }
  }
}

walk(exampleRoot);
console.log('Done. Backups have .bak extension.');
