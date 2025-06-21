// @path: addPathComments.js (ENDPOINT)
// @path: addPathComments.js (ENDPOINT)
// @path: addPathComments.js (ENDPOINT)
// @path: addPathComments.js (ENDPOINT)
// @path: addPathComments.js (ENDPOINT)

import { promises as fs } from "fs";
import { resolve, relative, extname } from "path";
import fg from "fast-glob";

// Match only clearly marked path comments (not just any comment)
const pathCommentRegex = /^\s*(\/\/|<!--)\s*@?path:?\s?.*[/\\].*(-->|\s*)$/;

async function prependCommentToFile(filePath) {
  const fileExtension = extname(filePath);
  const absPath = resolve(filePath);
  const projectRoot = process.cwd();
  const relPath = relative(projectRoot, absPath);

  let commentLine;
  switch (fileExtension) {
    case ".js":
    case ".kt":
      commentLine = `// @path: ${relPath} (ENDPOINT)\n`;
      break;
    case ".xml":
      commentLine = `<!-- @path: ${relPath} -->\n`;
      break;
    default:
      return;
  }

  let content = await fs.readFile(absPath, "utf8");

  const firstLines = content.split(/\r?\n/).slice(0, 5);
  const hasPathComment = firstLines.some(line => pathCommentRegex.test(line));

  if (hasPathComment) {
    console.log(`Skipping (already has comment): ${relPath}`);
    return;
  }

  let newContent;
  if (fileExtension === ".xml" && content.startsWith("<?xml")) {
    const declEnd = content.indexOf("?>");
    if (declEnd !== -1) {
      const before = content.slice(0, declEnd + 2);
      const rest = content.slice(declEnd + 2);
      const newline = rest.startsWith("\r\n") ? "\r\n" : "\n";
      const after = rest.replace(/^\r?\n/, "");
      newContent = before + newline + commentLine + after;
    } else {
      newContent = commentLine + content;
    }
  } else {
    newContent = commentLine + content;
  }

  await fs.writeFile(absPath, newContent, "utf8");
  console.log(`Prepended comment to ${relPath}`);
}

async function main() {
  const entries = await fg("**/*.{js,kt,xml}", {
    dot: true,
    ignore: ["node_modules/**"],
  });

  await Promise.all(entries.map(prependCommentToFile));
  console.log("Done!");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
