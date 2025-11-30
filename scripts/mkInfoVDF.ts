import readline from 'readline';
import fs from 'fs';
import path from 'path';

async function prompt(question: string): Promise<string> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
}

async function main() {
    const hudName = await prompt('Enter the HUD path relative to project root: ');
    const hudDir = path.join(process.cwd(), hudName);
    const outputFilePath = path.join(hudDir, 'info.vdf');
    const hudInfoName = await prompt('Enter the HUD info.vdf name (default: HUD): ').then(name => name.trim() || 'HUD');
    if (!fs.existsSync(hudDir)) {
        console.error(`HUD directory "${hudDir}" does not exist.`);
        return;
    }
    const infoVDFContent = `"${hudInfoName}"
{
    "ui_version"    "3"
}`;
    fs.writeFileSync(outputFilePath, infoVDFContent, 'utf8');
    console.log(`Created info.vdf at: ${outputFilePath}`);
}

await main();