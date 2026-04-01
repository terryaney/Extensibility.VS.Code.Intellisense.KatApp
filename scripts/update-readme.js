const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const newVersion = pkg.version;

const parts = newVersion.split('.');
const prevVersion = `${parts[0]}.${parts[1]}.${parseInt(parts[2], 10) - 1}`;

const readmePath = path.join(root, 'README.md');
let readme = fs.readFileSync(readmePath, 'utf8');

// Update all vsix download references (any prefix) from prev to new version
readme = readme.replace(
    new RegExp(`katapp-${prevVersion}\\.vsix`, 'g'),
    `katapp-${newVersion}.vsix`
);

// Prepend prev version to the Previous Versions list
const prevVersionLine = `1. [${prevVersion}](https://github.com/terryaney/Extensibility.VS.Code.Intellisense.KatApp/raw/main/dist/kat-intellisense-katapp-${prevVersion}.vsix)`;
readme = readme.replace(
    /## Previous Versions\n\n/,
    `## Previous Versions\n\n${prevVersionLine}\n`
);

fs.writeFileSync(readmePath, readme, 'utf8');
console.log(`README updated: ${prevVersion} → ${newVersion}`);
