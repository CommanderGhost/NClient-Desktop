const { downloadArtifact } = require('@electron/get');
const extract = require('extract-zip');
const fs = require('fs');
const path = require('path');
const os = require('os');

const version = require('../node_modules/electron/package.json').version;
const platform = process.platform;
const arch = process.arch;

console.log(`Version: ${version}, Platform: ${platform}, Arch: ${arch}`);

downloadArtifact({
    version,
    artifactName: 'electron',
    platform,
    arch
}).then(zipPath => {
    console.log("Zip downloaded to:", zipPath);
    console.log("Extracting to:", path.join(__dirname, '..', 'node_modules', 'electron', 'dist'));
    
    return extract(zipPath, { dir: path.join(__dirname, '..', 'node_modules', 'electron', 'dist') }).then(() => {
        console.log("Extraction complete!");
        const platformPath = platform === 'win32' ? 'electron.exe' : 'electron';
        fs.writeFileSync(path.join(__dirname, '..', 'node_modules', 'electron', 'path.txt'), platformPath);
        console.log("path.txt written successfully!");
    });
}).catch(err => {
    console.error("Installation error:", err);
});
