import * as vpk2 from "vpk2";
import * as fs from "fs";
import * as path from "path";

export enum OS {
    Linux,
    Windows
}

export function getTF2Path(os: OS): string {
    switch (os) {
        case OS.Linux:
            return "~/.steam/steam/steamapps/common/Team Fortress 2/tf";
        case OS.Windows:
            return "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Team Fortress 2\\tf";
    }
}

const tf2HudVPKPaths = [
    "tf2_misc_dir.vpk",
    "tf2_textures_dir.vpk",
    "tf2_sound_misc_dir.vpk",
];

const tf2HudVPKMapPaths = {
    "tf2_misc_dir.vpk": ["hud/"],
    "tf2_textures_dir.vpk": ["hud/"],
    "tf2_sound_misc_dir.vpk": ["sound/ui/"]
}

const tf2ScriptVPKPaths = [
    "scripts/"
];

function getFileWithClose(vpk: vpk2.VPK, filePath: string): Buffer {
    const entry = (vpk as any).tree[filePath];
    if (!entry || !entry.preloadOffset) {
        throw new Error('No such file in tree');
    }
    const file = Buffer.alloc(entry.preloadBytes + entry.entryLength);
    if (entry.preloadBytes > 0) {
        const directoryFile = fs.openSync(vpk.directoryPath, 'r');
        fs.readSync(directoryFile, file, 0, entry.preloadBytes, entry.preloadOffset);
        fs.closeSync(directoryFile);
    }
    if (entry.entryLength > 0) {
        if (entry.archiveIndex === 0x7fff) {
            let offset = ((vpk as any).header.treeLength ?? 0);
            if ((vpk as any).header.version === 1) {
                offset += 12;
            } else if ((vpk as any).header.version === 2) {
                offset += 28;
            }
            const directoryFile = fs.openSync(vpk.directoryPath, 'r');
            fs.readSync(directoryFile, file, entry.preloadBytes, entry.entryLength, offset + entry.entryOffset);
            fs.closeSync(directoryFile);
        } else {
            const fileIndex = ('000' + entry.archiveIndex).slice(-3);
            const archivePath = vpk.directoryPath.replace(/_dir\.vpk$/, '_' + fileIndex + '.vpk');
            const archiveFile = fs.openSync(archivePath, 'r');
            fs.readSync(archiveFile, file, entry.preloadBytes, entry.entryLength, entry.entryOffset);
            fs.closeSync(archiveFile);
        }
    }
    return file;
}

export async function loadTF2VPKs(os: OS): Promise<{ extract: (outDir?: string) => Record<string, Uint8Array> }> {
    const tf2Path = getTF2Path(os);
    const vpkFiles = tf2HudVPKPaths;
    const vpks: vpk2.VPK[] = [];
    for (const vpkFile of vpkFiles) {
        const fullPath = path.join(tf2Path, vpkFile);
        if (!fs.existsSync(fullPath)) {
            console.warn(`VPK file not found: ${fullPath}`);
            continue;
        }
        if (!fs.statSync(fullPath).isFile()) {
            console.warn(`VPK path is not a file: ${fullPath}`);
            continue;
        }
        try {
            const vpk = new vpk2.VPK(fullPath);
            vpk.load();
            vpks.push(vpk);
        } catch (error) {
            console.warn(`Failed to load VPK ${fullPath}: ${error}`);
        }
    }

    const scriptFiles: { fullPath: string; relativePath: string }[] = [];
    for (const scriptPath of tf2ScriptVPKPaths) {
        const fullPath = path.join(tf2Path, scriptPath);
        if (!fs.existsSync(fullPath)) {
            console.warn(`Script directory not found: ${fullPath}`);
            continue;
        }
        if (!fs.statSync(fullPath).isDirectory()) {
            console.warn(`Expected a script directory but found a file at ${fullPath}`);
            continue;
        }
        function walkSync(dir: string) {
            const children = fs.readdirSync(dir);
            for (const child of children) {
                const childFull = path.join(dir, child);
                if (fs.statSync(childFull).isDirectory()) {
                    walkSync(childFull);
                } else {
                    const relativePath = path.relative(tf2Path, childFull).replace(/\\/g, "/");
                    scriptFiles.push({ fullPath: childFull, relativePath });
                }
            }
        }
        walkSync(fullPath);
    }

    return {
        extract: (outDir = "extracted") => {
            const files: Record<string, Uint8Array> = {};

            for (const vpk of vpks) {
                const base = path.basename(vpk.directoryPath);
                for (const filePath of vpk.files) {
                    try {
                        const buf = getFileWithClose(vpk, filePath);
                        files[filePath] = buf;
                    } catch (error) {
                        console.warn(`Failed to read ${filePath} from ${base}: ${error}`);
                    }
                }
            }

            for (const s of scriptFiles) {
                try {
                    const buf = fs.readFileSync(s.fullPath);
                    files[s.relativePath] = buf;
                } catch (error) {
                    console.warn(`Failed to read script file ${s.fullPath}: ${error}`);
                }
            }

            if (outDir) {
                try {
                    if (!fs.existsSync(outDir)) {
                        fs.mkdirSync(outDir, { recursive: true });
                    }
                    for (const k in files) {
                        const dest = path.join(outDir, k);
                        const dir = path.dirname(dest);
                        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                        fs.writeFileSync(dest, files[k]!);
                    }
                } catch (error) {
                    console.warn(`Failed to write to ${outDir}: ${error}`);
                }
            }

            return files;
        }
    };
}

export function getOS(): OS {
    const platform = process.platform;
    switch (platform) {
        case "linux":
            return OS.Linux;
        case "win32":
            return OS.Windows;
        default:
            throw new Error(`Unsupported platform: ${platform}`);
    }
}