// @path: cleanAndPrepComments.js

import { promises as fs } from "fs";
import { resolve, relative, extname } from "path";
import fg from "fast-glob";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const scriptRelPath = relative(process.cwd(), __filename).replace(/\\/g, '/');

/**
 * Build a regex that matches exactly the given comment line (for .js/.kt/.xml).
 */
function buildExactPathCommentRegex(commentLine) {
  const escaped = commentLine
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/-->$/, '-->\\s*$');
  return new RegExp(`^\\s*${escaped}`, 'm');
}

/**
 * Prepend a `// @path: <relPath>` or `<!-- @path: <relPath> -->` if missing.
 */
async function prependCommentToFile(filePath) {
  const ext = extname(filePath).toLowerCase();
  const absPath = resolve(filePath);
  const relPath = relative(process.cwd(), absPath).replace(/\\/g, '/');

  let commentLine;
  if (ext === '.js' || ext === '.kt') {
    commentLine = `// @path: ${relPath}\n`;
  } else if (ext === '.xml') {
    commentLine = `<!-- @path: ${relPath} -->\n`;
  } else {
    return;
  }

  const raw = await fs.readFile(absPath, 'utf8');
  const header = raw.split(/\r?\n/, 10).join('\n');
  if (buildExactPathCommentRegex(commentLine).test(header)) {
    console.log(`Skipping (already has @path): ${relPath}`);
    return;
  }

  let newContent;
  if (ext === '.xml' && raw.startsWith('<?xml')) {
    const endDecl = raw.indexOf('?>');
    if (endDecl !== -1) {
      const before = raw.slice(0, endDecl + 2);
      const after  = raw.slice(endDecl + 2).replace(/^\r?\n/, '');
      newContent = `${before}\n${commentLine}${after}`;
    } else {
      newContent = `${commentLine}${raw}`;
    }
  } else {
    newContent = `${commentLine}${raw}`;
  }

  await fs.writeFile(absPath, newContent, 'utf8');
  console.log(`Prepended @path to: ${relPath}`);
}

/**
 * Remove all comments except those containing `@path:`.
 */
async function removeCommentsExceptPath(filePath) {
  const absPath = resolve(filePath);
  const relPath = relative(process.cwd(), absPath).replace(/\\/g, '/');
  const ext = extname(filePath).toLowerCase();
  let content = await fs.readFile(absPath, 'utf8');

  if (ext === '.js' || ext === '.kt') {
    content = content.replace(/\/\*[\s\S]*?\*\//g, m => /@path:/.test(m) ? m : '');
    content = content.replace(/^\s*\/\/.*$/gm, line => /@path:/.test(line) ? line : '');
    content = content.replace(/([^:"'\n])\/\/(?!.*@path:).*$/gm, (m, p) => p.trimEnd());
  } else if (ext === '.xml') {
    content = content.replace(/<!--[\s\S]*?-->/g, m => /@path:/.test(m) ? m : '');
  } else {
    return;
  }

  content = content.replace(/\n{3,}/g, '\n\n');
  if (!content.endsWith('\n')) content += '\n';

  await fs.writeFile(absPath, content, 'utf8');
  console.log(`Cleaned comments in: ${relPath}`);
}

/**
 * Main: glob for js/kt/xml, skip this script file, then prepend & clean.
 */
async function main() {
  const pattern = process.argv[2] || '**/*.{js,kt,xml}';
  let entries = await fg(pattern, {
    dot: true,
    ignore: ['node_modules/**'],
  });

  // filter out this script itself
  entries = entries.filter(f => f.replace(/\\/g, '/') !== scriptRelPath);

  if (!entries.length) {
    console.warn('No files found for pattern:', pattern);
    return;
  }

  for (const file of entries) {
    try {
      await prependCommentToFile(file);
      await removeCommentsExceptPath(file);
    } catch (err) {
      console.error(`Error processing ${file}:`, err);
    }
  }

  console.log('All done!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
