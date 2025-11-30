import { parse as parseKDL } from "kdljs";
import type { Node } from "kdljs";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { getOS, loadTF2VPKs, OS, getTF2Path } from "./lib/tf2";
import { parseRes, ResParser, kdlStringify } from "./lib/parseRes";
import { generateDiffReport, filterChangedFiles, exportChangedFiles } from "./lib/diffing";
import * as fs from "fs";
import path from "path";
const args = process.argv.slice(2);
const argv = yargs(hideBin(process.argv)).option("extract", {
  type: "boolean",
  description: "Extract VPK files",
  default: false
}).option("outDir", {
  type: "string",
  description: "Output directory for extracted files",
  default: "extracted"
}).option("parse", {
  type: "string",
  description: "Parse RES files to KDL format",
  default: undefined
}).option("recompile", {
  type: "string",
  description: "Recompile KDL files back to RES format",
  default: undefined
}).option("diff", {
  type: "string",
  description: "Generate diff report for directory (shows only changed files)",
  default: undefined
}).option("diffOnly", {
  type: "boolean",
  description: "With --recompile: only recompile changed files",
  default: false
}).option("exportDiff", {
  type: "string",
  description: "Export only changed files to output directory",
  default: undefined
}).option("resetDiff", {
  type: "boolean",
  description: "Reset the diff cache",
  default: false
}).option("skipDiff", {
  type: "boolean",
  description: "Skip updating diff cache during parse/recompile",
  default: false
}).option("recopy", {
  type: "string",
  description: "Recopy files to tf2 custom dir from specified directory",
  default: undefined
}).help().alias("help", "h");
const parsedArgs = argv.parseSync(args);
if (parsedArgs.extract) {
  console.log("Extracting VPK files...");
  const a = await loadTF2VPKs(getOS());
  a.extract(parsedArgs.outDir);
  console.log("Extraction complete.");
}
function* readdirRecursive(dir: string): Generator<string> {
  const entires = fs.readdirSync(dir, {
    withFileTypes: true
  });
  for (const entry of entires) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* readdirRecursive(fullPath);
    } else if (entry.isFile()) {
      yield fullPath;
    }
  }
}
if (parsedArgs.parse) {
  console.log(`Parsing RES/TXT files in ${parsedArgs.parse}...`);
  const inputDir = parsedArgs.parse;
  const outputDir = parsedArgs.outDir || path.join(inputDir, '..', 'extracted_kdl');
  const copyAsIsPatterns = ['hudanimations'];
  
  for (const filePath of readdirRecursive(inputDir)) {
    if (filePath.endsWith('.vdf')) {
      const relativePath = path.relative(inputDir, filePath);
      const finalOutputPath = path.join(outputDir, relativePath);
      const finalOutputDir = path.dirname(finalOutputPath);
      if (!fs.existsSync(finalOutputDir)) {
        fs.mkdirSync(finalOutputDir, { recursive: true });
      }
      fs.copyFileSync(filePath, finalOutputPath);
      console.log(`Copied ${path.relative(process.cwd(), filePath)} (vdf file)`);
    }
  }
  
  for (const filePath of readdirRecursive(inputDir)) {
    if (!filePath.endsWith('.res') && !filePath.endsWith('.txt')) continue;
    const relativePath = path.relative(inputDir, filePath);
    const basename = path.basename(filePath).toLowerCase();
    const shouldCopyAsIs = copyAsIsPatterns.some(pattern => basename.includes(pattern));
    if (shouldCopyAsIs) {
      const finalOutputPath = path.join(outputDir, relativePath);
      const finalOutputDir = path.dirname(finalOutputPath);
      if (!fs.existsSync(finalOutputDir)) {
        fs.mkdirSync(finalOutputDir, {
          recursive: true
        });
      }
      fs.copyFileSync(filePath, finalOutputPath);
      console.log(`Copied ${path.relative(process.cwd(), filePath)} (animation script)`);
      continue;
    }
    const outputPath = relativePath.replace(/\.(res|txt)$/, '.kdl');
    const finalOutputPath = path.join(outputDir, outputPath);
    const finalOutputDir = path.dirname(finalOutputPath);
    if (!fs.existsSync(finalOutputDir)) {
      fs.mkdirSync(finalOutputDir, {
        recursive: true
      });
    }
    try {
      const resContent = fs.readFileSync(filePath, 'utf8');
      const parsed = parseRes(resContent);
      if (!parsed || parsed.children.length === 0) {
        console.warn(`Failed to parse ${path.relative(process.cwd(), filePath)}: invalid structure`);
        continue;
      }
      let kdlContent = '';
      if (Object.keys(parsed.properties).length > 0) {
        for (const [key, value] of Object.entries(parsed.properties)) {
          kdlContent += `// ${key} "${value}"\n`;
        }
      }
      kdlContent += `// __FILE_PATH__ "${relativePath}"\n`;
      const compatibleNode: Node = {
        ...parsed,
        tags: {
          name: parsed.tags?.name?.[0],
          properties: Array.isArray(parsed.tags?.properties) ? {} : typeof parsed.tags?.properties === "object" && !Array.isArray(parsed.tags?.properties) ? parsed.tags?.properties as unknown as Record<string, string> : {},
          values: Array.isArray(parsed.tags?.values) ? parsed.tags?.values as string[] : []
        }
      };
      kdlContent += kdlStringify(compatibleNode);
      fs.writeFileSync(finalOutputPath, kdlContent);
      console.log(`Parsed ${path.relative(process.cwd(), filePath)} to ${path.relative(process.cwd(), finalOutputPath)}`);
    } catch (error) {
      console.warn(`Failed to parse ${path.relative(process.cwd(), filePath)}: ${error}`);
    }
  }
  if (!parsedArgs.skipDiff) {
    const trackedFiles = Array.from(readdirRecursive(outputDir)).filter(f => f.endsWith('.kdl') || f.endsWith('.txt'));
    const report = generateDiffReport(trackedFiles, outputDir);
    console.log(`Updated diff cache (${report.summary.total} files tracked)`);
  }
}
if (parsedArgs.recompile) {
  console.log(`Recompiling KDL files in ${parsedArgs.recompile}...`);
  const inputDir = parsedArgs.recompile;
  const outputDir = parsedArgs.outDir || path.join(inputDir, '..', 'extracted_res');
  
  for (const filePath of readdirRecursive(inputDir)) {
    if (filePath.endsWith('.vdf')) {
      const relativePath = path.relative(inputDir, filePath);
      const outputPath = path.join(outputDir, relativePath);
      const outputSubDir = path.dirname(outputPath);
      if (!fs.existsSync(outputSubDir)) {
        fs.mkdirSync(outputSubDir, { recursive: true });
      }
      fs.copyFileSync(filePath, outputPath);
      console.log(`Copied ${path.relative(process.cwd(), filePath)} (vdf file)`);
    }
  }
  
  const txtFiles = Array.from(readdirRecursive(inputDir)).filter(f => f.endsWith('.txt'));
  for (const txtFile of txtFiles) {
    const relativePath = path.relative(inputDir, txtFile);
    const outputPath = path.join(outputDir, relativePath);
    const outputSubDir = path.dirname(outputPath);
    if (!fs.existsSync(outputSubDir)) {
      fs.mkdirSync(outputSubDir, { recursive: true });
    }
    fs.copyFileSync(txtFile, outputPath);
    console.log(`Copied ${path.relative(process.cwd(), txtFile)} to ${path.relative(process.cwd(), outputPath)}`);
  }
  
  let kdlFiles = Array.from(readdirRecursive(inputDir)).filter(f => f.endsWith('.kdl'));
  if (parsedArgs.diffOnly) {
    const changedFiles = filterChangedFiles(kdlFiles, inputDir, ['added', 'modified']);
    const essentialKdlFiles = kdlFiles.filter(f => {
      const basename = path.basename(f).toLowerCase();
      return basename.includes('scheme') || basename.includes('hudlayout');
    });
    const allFiles = Array.from(new Set([...changedFiles, ...essentialKdlFiles]));
    console.log(`Processing ${allFiles.length}/${kdlFiles.length} files (${changedFiles.length} changed + ${essentialKdlFiles.length} essential)...`);
    kdlFiles = allFiles;
  }
  for (const filePath of kdlFiles) {
    try {
      const kdlContent = fs.readFileSync(filePath, 'utf8');
      const lines = kdlContent.split('\n');
      const directives: string[] = [];
      let filePath_meta = '';
      for (const line of lines) {
        if (line.trim().startsWith('//')) {
          const comment = line.trim().substring(2).trim();
          if (comment.startsWith('__DIRECTIVE__')) {
            const directiveMatch = comment.match(/__DIRECTIVE__\s+(.+)$/);
            if (directiveMatch) {
              directives.push(directiveMatch[1]!);
            }
          } else if (comment.startsWith('#base') || comment.startsWith('#include')) {
            directives.push(comment);
          } else if (comment.startsWith('__FILE_PATH__')) {
            const match = comment.match(/__FILE_PATH__\s+"([^"]+)"/);
            if (match) filePath_meta = match[1]!;
          }
        } else if (line.trim() !== '') {
          break;
        }
      }
      const cleanKdl = lines.filter(l => !l.trim().startsWith('//')).join('\n');
      try {
        const parseResult = parseKDL(cleanKdl);
        if (parseResult.errors && parseResult.errors.length > 0) {
          throw new Error(`Parse error at line ${parseResult.errors[0]!.token.startLine}: ${parseResult.errors[0]!.token.image}`);
        }
        if (!parseResult.output || parseResult.output.length === 0) {
          throw new Error(`No output from KDL parse`);
        }
        const rootNode = parseResult.output[0];
        if (!rootNode || !rootNode.children || rootNode.children.length === 0) {
          throw new Error(`No inner nodes in root`);
        }
        const innerNode = rootNode.children[0]!;
        (innerNode as any).directives = directives;
        let outputFilePath = filePath_meta || innerNode!.name;
        if (!outputFilePath.endsWith('.res') && !outputFilePath.endsWith('.txt')) {
          outputFilePath += '.res';
        }
        const outputFile = path.join(outputDir, outputFilePath);
        const finalOutputDir = path.dirname(outputFile);
        if (!fs.existsSync(finalOutputDir)) {
          fs.mkdirSync(finalOutputDir, {
            recursive: true
          });
        }
        const resContent = ResParser.stringify(innerNode);
        fs.writeFileSync(outputFile, resContent);
        console.log(`Recompiled ${path.relative(process.cwd(), filePath)} to ${path.relative(process.cwd(), outputFile)}`);
      } catch (parseErr) {
        throw new Error(`KDL parse error: ${parseErr}`);
      }
    } catch (error) {
      console.warn(`Failed to recompile ${path.relative(process.cwd(), filePath)}: ${error}`);
    }
  }
  if (!parsedArgs.skipDiff) {
    const resFiles = Array.from(readdirRecursive(outputDir)).filter(f => f.endsWith('.res') || f.endsWith('.txt'));
    const report = generateDiffReport(resFiles, outputDir);
    console.log(`Updated diff cache (${report.summary.total} files tracked)`);
  }
}
if (parsedArgs.resetDiff) {
  const cacheFile = path.join(process.cwd(), '.hud_diff_cache');
  if (fs.existsSync(cacheFile)) {
    fs.unlinkSync(cacheFile);
    console.log('Diff cache reset');
  } else {
    console.log('Cache file not found');
  }
}
if (parsedArgs.exportDiff) {
  console.log(`\nExporting changed files to ${parsedArgs.exportDiff}...`);
  const inputDir = parsedArgs.parse || 'extracted_kdl';
  function* getFiles(dir: string): Generator<string> {
    const entries = fs.readdirSync(dir, {
      withFileTypes: true
    });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        yield* getFiles(fullPath);
      } else if (entry.isFile()) {
        yield fullPath;
      }
    }
  }
  const outputDir = parsedArgs.exportDiff;
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, {
      recursive: true
    });
  }
  const allFiles = Array.from(getFiles(inputDir));
  const essentialFiles = allFiles.filter(f => {
    const basename = path.basename(f).toLowerCase();
    return basename.includes('scheme') || basename.includes('hudlayout') || basename.includes('hudanimations') || basename === 'info.vdf';
  });
  const {
    copied,
    skipped
  } = exportChangedFiles(inputDir, outputDir, ['added', 'modified'], essentialFiles);
  console.log(`Exported ${copied} changed files (${skipped} unchanged)`);
}
if (parsedArgs.recopy) {
  console.log(`\nRecopying files to TF2 custom directory...`);
  const inputDir = parsedArgs.recopy;
  const tf2dir = getTF2Path(getOS());
  const customDir = path.join(tf2dir, 'custom', 'hud_recopy');
  if (!fs.existsSync(customDir)) {
    fs.mkdirSync(customDir, {
      recursive: true
    });
  }
  function* getAllFiles(dir: string): Generator<string> {
    const entries = fs.readdirSync(dir, {
      withFileTypes: true
    });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        yield* getAllFiles(fullPath);
      } else if (entry.isFile()) {
        yield fullPath;
      }
    }
  }
  const allFiles = Array.from(getAllFiles(inputDir));
  const essentialFiles = allFiles.filter(f => {
    const basename = path.basename(f).toLowerCase();
    return basename.includes('scheme') || basename.includes('hudlayout') || basename.includes('hudanimations') || basename === 'info.vdf';
  });
  
  let filesToCopy: string[];
  if (parsedArgs.diffOnly) {
    const changedFiles = filterChangedFiles(allFiles, inputDir, ['added', 'modified']);
    filesToCopy = Array.from(new Set([...changedFiles, ...essentialFiles]));
    console.log(`Processing ${filesToCopy.length} files (${changedFiles.length} changed + ${essentialFiles.length} essential)`);
  } else {
    filesToCopy = allFiles;
  }
  
  let copied = 0;
  for (const filePath of filesToCopy) {
    const relativePath = path.relative(inputDir, filePath);
    const outputPath = path.join(customDir, relativePath);
    const outputSubDir = path.dirname(outputPath);
    if (!fs.existsSync(outputSubDir)) {
      fs.mkdirSync(outputSubDir, { recursive: true });
    }
    fs.copyFileSync(filePath, outputPath);
    copied++;
  }
  console.log(`Recopied ${copied} files to TF2 custom directory`);
}