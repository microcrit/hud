import { readFileSync, writeFileSync, statSync } from "fs";
import { createHash } from "crypto";
import path from "path";
export interface FileChange {
  path: string;
  status: "added" | "modified" | "deleted" | "unchanged";
  hash: string;
  previousHash?: string;
  size: number;
  previousSize?: number;
  timestamp: number;
}
export interface DiffReport {
  timestamp: number;
  added: FileChange[];
  modified: FileChange[];
  deleted: FileChange[];
  unchanged: FileChange[];
  summary: {
    total: number;
    changed: number;
    percentageChanged: number;
  };
}
interface HashDatabase {
  [filepath: string]: {
    hash: string;
    size: number;
    timestamp: number;
  };
}
let fileHashDatabase: HashDatabase = {};
export function hashFile(filePath: string): string {
  try {
    const content = readFileSync(filePath, "utf8");
    return createHash("sha256").update(content).digest("hex");
  } catch (error) {
    return "error";
  }
}
export function loadHashDatabase(baseDir: string): HashDatabase {
  const dbPath = path.join(baseDir, ".hud_diff_cache");
  try {
    const content = readFileSync(dbPath, "utf8");
    return JSON.parse(content);
  } catch {
    return {};
  }
}
export function saveHashDatabase(baseDir: string, db: HashDatabase): void {
  const dbPath = path.join(baseDir, ".hud_diff_cache");
  writeFileSync(dbPath, JSON.stringify(db, null, 2));
}
export function compareFileChange(filePath: string, currentHash: string, previousRecord?: {
  hash: string;
  size: number;
}): FileChange {
  const stats = statSync(filePath);
  if (!previousRecord) {
    return {
      path: filePath,
      status: "added",
      hash: currentHash,
      size: stats.size,
      timestamp: Date.now()
    };
  }
  if (currentHash !== previousRecord.hash) {
    return {
      path: filePath,
      status: "modified",
      hash: currentHash,
      previousHash: previousRecord.hash,
      size: stats.size,
      previousSize: previousRecord.size,
      timestamp: Date.now()
    };
  }
  return {
    path: filePath,
    status: "unchanged",
    hash: currentHash,
    size: stats.size,
    timestamp: Date.now()
  };
}
export function generateDiffReport(files: string[], baseDir: string): DiffReport {
  const hashDb = loadHashDatabase(baseDir);
  const changes: FileChange[] = [];
  for (const filePath of files) {
    const currentHash = hashFile(filePath);
    const relativePath = path.relative(baseDir, filePath);
    const previousRecord = hashDb[relativePath];
    const change = compareFileChange(filePath, currentHash, previousRecord);
    changes.push(change);
    hashDb[relativePath] = {
      hash: currentHash,
      size: statSync(filePath).size,
      timestamp: Date.now()
    };
  }
  for (const dbPath in hashDb) {
    if (!files.some(f => path.relative(baseDir, f) === dbPath)) {
      changes.push({
        path: dbPath,
        status: "deleted",
        hash: hashDb[dbPath]!.hash,
        size: hashDb[dbPath]!.size,
        timestamp: Date.now()
      });
      delete hashDb[dbPath];
    }
  }
  saveHashDatabase(baseDir, hashDb);
  const report: DiffReport = {
    timestamp: Date.now(),
    added: changes.filter(c => c.status === "added"),
    modified: changes.filter(c => c.status === "modified"),
    deleted: changes.filter(c => c.status === "deleted"),
    unchanged: changes.filter(c => c.status === "unchanged"),
    summary: {
      total: changes.length,
      changed: changes.filter(c => c.status !== "unchanged").length + changes.filter(c => c.status === "deleted").length,
      percentageChanged: 0
    }
  };
  report.summary.percentageChanged = report.summary.total > 0 ? Math.round((report.summary.changed - report.deleted.length) / report.summary.total * 100) : 0;
  return report;
}
export function filterChangedFiles(files: string[], baseDir: string, statusFilter?: ("added" | "modified")[]): string[] {
  const hashDb = loadHashDatabase(baseDir);
  const filtered: string[] = [];
  for (const filePath of files) {
    const currentHash = hashFile(filePath);
    const relativePath = path.relative(baseDir, filePath);
    const previousRecord = hashDb[relativePath];
    if (!previousRecord) {
      if (!statusFilter || statusFilter.includes("added")) {
        filtered.push(filePath);
      }
    } else if (currentHash !== previousRecord.hash) {
      if (!statusFilter || statusFilter.includes("modified")) {
        filtered.push(filePath);
      }
    }
  }
  return filtered;
}
function formatBytes(bytes: number): string {
  if (Math.abs(bytes) < 1024) return `${bytes}B`;
  if (Math.abs(bytes) < 1048576) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1048576).toFixed(1)}MB`;
}
export function exportChangedFiles(sourceDir: string, outputDir: string, statusFilter?: ("added" | "modified")[], forceIncludeFiles?: string[]): {
  copied: number;
  skipped: number;
} {
  const fs = require("fs");
  let copied = 0;
  let skipped = 0;
  function getFiles(dir: string): string[] {
    const files: string[] = [];
    const entries = fs.readdirSync(dir, {
      withFileTypes: true
    });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...getFiles(fullPath));
      } else {
        files.push(fullPath);
      }
    }
    return files;
  }
  const files = getFiles(sourceDir);
  let changedFiles = filterChangedFiles(files, sourceDir, statusFilter);
  
  if (forceIncludeFiles && forceIncludeFiles.length > 0) {
    const forceSet = new Set(forceIncludeFiles);
    changedFiles = Array.from(new Set([...changedFiles, ...forceIncludeFiles]));
  }
  
  for (const filePath of changedFiles) {
    const relativePath = path.relative(sourceDir, filePath);
    const outputPath = path.join(outputDir, relativePath);
    const outputSubDir = path.dirname(outputPath);
    if (!fs.existsSync(outputSubDir)) {
      fs.mkdirSync(outputSubDir, {
        recursive: true
      });
    }
    const content = readFileSync(filePath, "utf8");
    writeFileSync(outputPath, content);
    copied++;
  }
  return {
    copied,
    skipped: files.length - copied
  };
}