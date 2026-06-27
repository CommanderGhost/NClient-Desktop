const { spawn } = require('child_process');
const http = require('http');

const VITE_URL = 'http://localhost:5173';

function checkViteReady() {
    return new Promise((resolve) => {
        http.get(VITE_URL, (res) => {
            if (res.statusCode >= 200 && res.statusCode < 400) {
                resolve(true);
            } else {
                resolve(false);
            }
        }).on('error', () => {
            resolve(false);
        });
    });
}

async function start() {
    console.log('Waiting for Vite dev server to start on port 5173...');
    let ready = false;
    while (!ready) {
        ready = await checkViteReady();
        if (!ready) {
            await new Promise((r) => setTimeout(r, 500));
        }
    }
    console.log('Vite dev server is ready! Launching Electron...');
    
    // Spawn electron command (uses local electron package)
    const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const electronProcess = spawn(cmd, ['electron', '.'], {
        stdio: 'inherit',
        shell: true
    });

    electronProcess.on('close', (code) => {
        process.exit(code);
    });
}

start();
