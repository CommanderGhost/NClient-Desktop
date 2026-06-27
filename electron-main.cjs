const { app, BrowserWindow, ipcMain, protocol, shell, session, clipboard, net, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const dohClient = require('./doh-client.cjs');

// Bypass DNS hijack for nhentai.net inside Chromium network stack (enables standard windows like login modal to resolve correctly)
app.commandLine.appendSwitch('host-resolver-rules', 'MAP nhentai.net 104.26.4.188, MAP nhentai.net 104.26.5.188, MAP nhentai.net 172.67.74.203, MAP *.nhentai.net 104.26.4.188, MAP *.nhentai.net 104.26.5.188, MAP *.nhentai.net 172.67.74.203');

// Disable blink features related to automation detection (like navigator.webdriver)
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');

// Set a clean global User-Agent fallback matching Electron's Chromium version to ensure User-Agent Client Hints (Sec-CH-UA) are consistent and do not leak "Electron"
const chromeVersion = process.versions.chrome;
app.userAgentFallback = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;



// Register custom protocol as secure and privileged before app is ready
protocol.registerSchemesAsPrivileged([
    {
        scheme: 'nhentai-image',
        privileges: {
            standard: true,
            bypassCSP: true,
            secure: true,
            corsEnabled: true,
            supportFetchAPI: true,
            stream: true
        }
    }
]);

let mainWindow;

// Paths
const userDataPath = app.getPath('userData');
const settingsPath = path.join(userDataPath, 'settings.json');
const favoritesPath = path.join(userDataPath, 'favorites.json');
const bookmarksPath = path.join(userDataPath, 'bookmarks.json');
const downloadsMetaPath = path.join(userDataPath, 'downloads.json');

// Default configurations
const defaultSettings = {
    mirror: 'nhentai.net',
    apiKey: '',
    pinEnabled: false,
    pinHash: '',
    lockType: 'pin',
    blacklistedTags: [],
    avoidTagsBehavior: 'blur', // 'blur' or 'hide'
    downloadPath: path.join(app.getPath('downloads'), 'NClientDesktopDownloads'),
    sessionCookies: '',
    username: '',
    userId: '',
    favoritesCount: 0,
    downloadSpeedLimit: 0,
    maxConcurrentDownloads: 1
};

// Ensure path helper
function ensureDirectoryExistence(filePath) {
    const dirname = path.dirname(filePath);
    if (fs.existsSync(dirname)) {
        return true;
    }
    ensureDirectoryExistence(dirname);
    fs.mkdirSync(dirname);
}

// Data Helper Functions
function loadJSON(filePath, defaultValue = {}) {
    try {
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(content);
        }
    } catch (e) {
        console.error(`Error loading JSON from ${filePath}:`, e);
    }
    return defaultValue;
}

function saveJSON(filePath, data) {
    try {
        ensureDirectoryExistence(filePath);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (e) {
        console.error(`Error saving JSON to ${filePath}:`, e);
        return false;
    }
}

function getFormattedName(gallery) {
    let artist = 'unknown';
    if (gallery.tags && Array.isArray(gallery.tags)) {
        const artistTag = gallery.tags.find(t => t.type === 'artist');
        if (artistTag) {
            artist = artistTag.name;
        }
    }
    
    // Replace characters that are invalid for paths or file systems
    const title = (gallery.title.pretty || gallery.title.english || gallery.id.toString())
        .replace(/[/|\\*\"'?:<>]/g, ' ')
        .trim();
    
    const rawName = `${gallery.id}_${artist}_${title}`;
    // Replace spaces and consecutive underscores/special characters
    return rawName.replace(/[/|\\*\"'?:<>]/g, '_').replace(/\s+/g, '_').replace(/_+/g, '_').trim();
}

// Download Queues
let activeDownloads = {}; // galleryId -> progress info
let downloadQueue = [];   // pending download items queue
let isQueueRunning = false; // whether the download queue is active
let pdfQueue = [];        // pending PDF exports queue
let isPdfProcessing = false; // whether PDF conversion is currently running
let pausedDownloads = {};    // galleryId -> boolean
let cancelledDownloads = {}; // galleryId -> boolean

// Initializer
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1350,
        height: 794,
        minWidth: 800,
        minHeight: 600,
        frame: true,
        titleBarStyle: 'default',
        backgroundColor: '#121214',
        webPreferences: {
            preload: path.join(__dirname, 'electron-preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: true, // Still true because custom protocol handles bypassed requests
            disableBlinkFeatures: 'AutomationControlled'
        }
    });

    // Check if in development mode
    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// App Life Cycle
app.whenReady().then(() => {
    // Register custom protocol handler to resolve images via DoH
    protocol.handle('nhentai-image', async (request) => {
        try {
            // e.g. nhentai-image://t1.nhentai.net/galleries/4011896/thumb.webp
            const rawUrl = request.url.replace('nhentai-image://', 'https://');
            console.log('Proxying image via DoH:', rawUrl);
            const buffer = await dohClient.fetchBuffer(rawUrl);

            let contentType = 'image/jpeg';
            if (rawUrl.endsWith('.png')) contentType = 'image/png';
            if (rawUrl.endsWith('.webp')) contentType = 'image/webp';
            if (rawUrl.endsWith('.gif')) contentType = 'image/gif';

            return new Response(buffer, {
                headers: { 'Content-Type': contentType }
            });
        } catch (e) {
            console.error('Failed proxying image:', request.url, e);
            return new Response('Not Found', { status: 404 });
        }
    });

    createWindow();
    restoreSessionCookies();
    initializeDownloadQueue();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
            initializeDownloadQueue();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// IPC Handler Registrations

// Settings IPCs
ipcMain.handle('get-settings', () => {
    const settings = loadJSON(settingsPath, defaultSettings);
    // Ensure all default keys exist
    return { ...defaultSettings, ...settings };
});

ipcMain.handle('save-settings', (event, newSettings) => {
    const current = loadJSON(settingsPath, defaultSettings);
    const updated = { ...current, ...newSettings };
    saveJSON(settingsPath, updated);
    return updated;
});

// Restore session cookies on startup
async function restoreSessionCookies() {
    const settings = loadJSON(settingsPath, defaultSettings);
    const domain = settings.mirror || 'nhentai.net';
    const cookiesString = settings.sessionCookies;
    if (!cookiesString) return;

    try {
        const cookiePairs = cookiesString.split(';').map(p => p.trim()).filter(Boolean);
        for (const pair of cookiePairs) {
            const eqIdx = pair.indexOf('=');
            if (eqIdx === -1) continue;
            const name = pair.substring(0, eqIdx).trim();
            const value = pair.substring(eqIdx + 1).trim();

            await session.defaultSession.cookies.set({
                url: `https://${domain}`,
                name,
                value,
                domain: `.${domain}`,
                path: '/'
            });
        }
        console.log('Restored session cookies on startup successfully.');
    } catch (e) {
        console.error('Failed to restore session cookies on startup:', e);
    }
}

// Helper to verify cookie session and save details to settings
async function verifyAndSaveSession(cookiesString) {
    const settings = loadJSON(settingsPath, defaultSettings);
    const domain = settings.mirror || 'nhentai.net';
    
    // Set cookies into default session first to ensure net.fetch uses them
    const cookiePairs = cookiesString.split(';').map(p => p.trim()).filter(Boolean);
    for (const pair of cookiePairs) {
        const eqIdx = pair.indexOf('=');
        if (eqIdx === -1) continue;
        const name = pair.substring(0, eqIdx).trim();
        const value = pair.substring(eqIdx + 1).trim();

        await session.defaultSession.cookies.set({
            url: `https://${domain}`,
            name,
            value,
            domain: `.${domain}`,
            path: '/'
        });
    }

    const headers = {
        'User-Agent': app.userAgentFallback,
        'Cookie': cookiesString
    };

    // Now fetch the user's favorites page to get their profile details and actual favorites count via net.fetch
    console.log(`Verifying session via net.fetch...`);
    const response = await net.fetch(`https://${domain}/user/favorites/`, { headers });
    const html = await response.text();
    
    // Parse username and user ID
    const userRegex = /\/users\/(\d+)\/([^/"]+)/;
    const match = html.match(userRegex);
    
    if (match) {
        const userId = match[1];
        const username = match[2];
        
        // Parse favorites count from the h1 count span (e.g., class="count">(19,937)</)
        const favCountRegex = /class="count">\(([\d,]+)\)</;
        const favMatch = html.match(favCountRegex);
        const favoritesCount = favMatch ? parseInt(favMatch[1].replace(/,/g, ''), 10) : 0;
        
        const current = loadJSON(settingsPath, defaultSettings);
        current.sessionCookies = cookiesString;
        current.username = username;
        current.userId = userId;
        current.favoritesCount = favoritesCount;
        saveJSON(settingsPath, current);
        
        return {
            success: true,
            username,
            userId,
            favoritesCount
        };
    } else {
        if (html.includes('/login/') || html.includes('login')) {
            throw new Error('Invalid or expired cookies (Not logged in)');
        }
        throw new Error('Failed to parse user profile. Make sure the cookies contain a valid sessionid.');
    }
}

ipcMain.handle('verify-nhentai-session', async (event, cookiesString) => {
    try {
        const result = await verifyAndSaveSession(cookiesString);
        return result;
    } catch (e) {
        console.error('Session verification error:', e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('login-nhentai', () => {
    return new Promise((resolve) => {
        const settings = loadJSON(settingsPath, defaultSettings);
        const domain = settings.mirror || 'nhentai.net';

        let loginWindow = new BrowserWindow({
            width: 600,
            height: 700,
            title: `Login to ${domain}`,
            autoHideMenuBar: true,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: true,
                disableBlinkFeatures: 'AutomationControlled'
            }
        });

        // Use the global fallback User-Agent matching the exact engine version
        loginWindow.webContents.setUserAgent(app.userAgentFallback);

        loginWindow.loadURL(`https://${domain}/login/`);

        const loginSession = loginWindow.webContents.session;

        const checkLogin = async () => {
            try {
                if (loginWindow.isDestroyed()) return;

                // Try to extract profile details from the loginWindow DOM directly
                let domProfile = null;
                try {
                    domProfile = await loginWindow.webContents.executeJavaScript(`
                        (() => {
                            const userLink = document.querySelector('a[href^="/users/"]');
                            if (!userLink) return null;
                            const href = userLink.getAttribute('href');
                            const match = href.match(/\\/users\\/(\\d+)\\/([^/]+)/);
                            if (!match) return null;
                            
                            let favoritesCount = 0;
                            const favLink = document.querySelector('a[href="/favorites/"] .count');
                            if (favLink) {
                                const val = favLink.textContent.replace(/[^0-9]/g, '');
                                favoritesCount = parseInt(val, 10) || 0;
                            }
                            return {
                                userId: match[1],
                                username: match[2],
                                favoritesCount
                            };
                        })()
                    `);
                } catch (domErr) {
                    console.error('DOM profile extraction failed:', domErr.message);
                }

                if (domProfile && domProfile.userId) {
                    const cookies = await loginSession.cookies.get({});
                    const domainCookies = cookies.filter(c => c.domain && c.domain.includes(domain));
                    const cookieString = domainCookies.map(c => `${c.name}=${c.value}`).join('; ');

                    // Verify the session using our helper to get the exact online favorites count
                    const verifyResult = await verifyAndSaveSession(cookieString).catch((err) => {
                        console.error('DoH verify session failed during login, falling back to DOM profile:', err.message);
                        
                        // Save directly to settings.json
                        const current = loadJSON(settingsPath, defaultSettings);
                        current.sessionCookies = cookieString;
                        current.username = domProfile.username;
                        current.userId = domProfile.userId;
                        current.favoritesCount = domProfile.favoritesCount || 0;
                        saveJSON(settingsPath, current);

                        return {
                            success: true,
                            username: domProfile.username,
                            userId: domProfile.userId,
                            favoritesCount: domProfile.favoritesCount || 0
                        };
                    });

                    try {
                        loginSession.cookies.removeListener('changed', cookieListener);
                    } catch (e) {}

                    resolve({
                        success: true,
                        username: verifyResult.username || domProfile.username,
                        userId: verifyResult.userId || domProfile.userId,
                        favoritesCount: verifyResult.favoritesCount || 0
                    });
                    loginWindow.close();
                    return;
                }

                // Fallback: only try DoH/net verification if we are not on the login page
                const currentUrl = loginWindow.webContents.getURL();
                if (!currentUrl.includes('/login/')) {
                    const cookies = await loginSession.cookies.get({});
                    const domainCookies = cookies.filter(c => c.domain && c.domain.includes(domain));
                    const sessionIdCookie = domainCookies.find(c => c.name === 'sessionid');
                    if (sessionIdCookie) {
                        const cookieString = domainCookies.map(c => `${c.name}=${c.value}`).join('; ');
                        
                        // Verify the session using our helper and save details to settings.json
                        let verifyResult;
                        try {
                            verifyResult = await verifyAndSaveSession(cookieString);
                        } catch (err) {
                            console.error('DoH verify session failed in fallback:', err.message);
                            const current = loadJSON(settingsPath, defaultSettings);
                            current.sessionCookies = cookieString;
                            current.username = 'User';
                            current.userId = '';
                            current.favoritesCount = 0;
                            saveJSON(settingsPath, current);
                            
                            verifyResult = {
                                success: true,
                                username: 'User',
                                userId: '',
                                favoritesCount: 0
                            };
                        }

                        try {
                            loginSession.cookies.removeListener('changed', cookieListener);
                        } catch (e) {}

                        resolve({ success: true, ...verifyResult });
                        loginWindow.close();
                    }
                }
            } catch (err) {
                console.error('Check login error in popup:', err.message);
            }
        };

        const cookieListener = (event, cookie, cause, removed) => {
            if (cookie.name === 'sessionid' && !removed && cookie.domain && cookie.domain.includes(domain)) {
                checkLogin();
            }
        };

        loginSession.cookies.on('changed', cookieListener);
        loginWindow.webContents.on('did-navigate', checkLogin);
        loginWindow.webContents.on('did-frame-navigate', checkLogin);
        loginWindow.webContents.on('did-finish-load', checkLogin);

        loginWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
            console.error('Login window failed to load:', errorCode, errorDescription, validatedURL);
        });

        loginWindow.on('closed', () => {
            try {
                loginSession.cookies.removeListener('changed', cookieListener);
            } catch (e) {
                // Ignore
            }
            resolve({ success: false, error: 'Window closed' });
        });
    });
});

ipcMain.handle('get-online-favorites', async (event, pageNumber = 1) => {
    try {
        const settings = loadJSON(settingsPath, defaultSettings);
        const domain = settings.mirror || 'nhentai.net';
        const cookiesString = settings.sessionCookies;
        
        if (!cookiesString) {
            return { success: false, error: 'No session cookies configured. Please log in.' };
        }
        
        // Ensure cookies are correctly synced in Electron's defaultSession
        const cookiePairs = cookiesString.split(';').map(p => p.trim()).filter(Boolean);
        for (const pair of cookiePairs) {
            const eqIdx = pair.indexOf('=');
            if (eqIdx === -1) continue;
            const name = pair.substring(0, eqIdx).trim();
            const value = pair.substring(eqIdx + 1).trim();

            await session.defaultSession.cookies.set({
                url: `https://${domain}`,
                name,
                value,
                domain: `.${domain}`,
                path: '/'
            });
        }
        
        const headers = {
            'User-Agent': app.userAgentFallback
        };
        if (cookiesString) {
            headers['Cookie'] = cookiesString;
        }
        
        // Fetch via Electron's net.fetch using Chromium stack to bypass Cloudflare 403
        console.log(`Fetching online favorites via net.fetch for page ${pageNumber}...`);
        const response = await net.fetch(`https://${domain}/favorites/?page=${pageNumber}`, { headers });
        const html = await response.text();
        
        const galleries = [];
        const regex = /<div class="gallery(?:\s+[^"]*)?"[^>]*>([\s\S]*?<\/a>)/g;
        let match;
        while ((match = regex.exec(html)) !== null) {
            const inner = match[1];
            
            const idMatch = inner.match(/href="\/g\/(\d+)\/"/);
            if (!idMatch) continue;
            const id = parseInt(idMatch[1], 10);
            
            const srcMatch = inner.match(/src="([^"]+)"/);
            const dataSrcMatch = inner.match(/data-src="([^"]+)"/);
            const imgUrl = (dataSrcMatch ? dataSrcMatch[1] : (srcMatch ? srcMatch[1] : ''));
            
            const titleMatch = inner.match(/<div class="caption">([^<]+)<\/div>/);
            const title = titleMatch ? titleMatch[1].trim() : 'No Title';
            
            let media_id = '';
            let coverPath = '';
            const mediaMatch = imgUrl.match(/galleries\/(\d+)\/([^\s"]+)/);
            if (mediaMatch) {
                media_id = mediaMatch[1];
                coverPath = `galleries/${media_id}/${mediaMatch[2]}`;
            }
            
            galleries.push({
                id,
                media_id,
                title: {
                    pretty: title
                },
                cover: {
                    path: coverPath
                },
                num_pages: 0
            });
        }
        
        // Sort galleries by ID descending (newest ID first)
        galleries.sort((a, b) => b.id - a.id);
        
        // Hydrate galleries with exact page count, favorite count, titles and tags from public JSON API
        console.log(`Hydrating ${galleries.length} favorites from nHentai API...`);
        const detailedGalleries = [];
        const chunkSize = 5;

        for (let i = 0; i < galleries.length; i += chunkSize) {
            const chunk = galleries.slice(i, i + chunkSize);
            const chunkDetails = await Promise.all(chunk.map(async (g) => {
                try {
                    const detailUrl = `https://${domain}/api/gallery/${g.id}`;
                    const detail = await dohClient.fetchJson(detailUrl, { headers });
                    if (detail) {
                        return {
                            ...g,
                            num_pages: detail.num_pages,
                            num_favorites: detail.num_favorites,
                            title: detail.title,
                            tags: detail.tags
                        };
                    }
                } catch (err) {
                    console.error(`Failed to hydrate gallery ${g.id} via DoH:`, err.message);
                }
                return g;
            }));
            detailedGalleries.push(...chunkDetails);
        }

        let numPages = 1;
        const paginationRegex = /href="[^"]*page=(\d+)"/g;
        let pagMatch;
        while ((pagMatch = paginationRegex.exec(html)) !== null) {
            const pageNum = parseInt(pagMatch[1], 10);
            if (pageNum > numPages) {
                numPages = pageNum;
            }
        }
        
        return { success: true, result: detailedGalleries, num_pages: numPages };
    } catch (e) {
        console.error('Fetch online favorites error:', e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('logout-nhentai', async () => {
    const current = loadJSON(settingsPath, defaultSettings);
    current.sessionCookies = '';
    current.username = '';
    current.userId = '';
    current.favoritesCount = 0;
    saveJSON(settingsPath, current);
    
    try {
        const cookies = await session.defaultSession.cookies.get({ domain: 'nhentai.net' });
        for (const cookie of cookies) {
            await session.defaultSession.cookies.remove('https://nhentai.net', cookie.name);
        }
    } catch (e) {
        console.error('Error clearing session cookies:', e);
    }
    return true;
});

// Favorites IPCs
ipcMain.handle('get-favorites', () => {
    return loadJSON(favoritesPath, []);
});

function debugLog(msg) {
    try {
        const logPath = 'c:\\Users\\IKAN KESELEK\\Downloads\\Compressed\\NClient-Desktop\\favorite-debug.log';
        fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`, 'utf8');
    } catch (e) {
        console.error('Failed to write debug log:', e);
    }
}

async function toggleOnlineFavorite(galleryId) {
    debugLog(`Starting toggleOnlineFavorite for gallery ${galleryId}`);
    const settings = loadJSON(settingsPath, defaultSettings);
    const domain = settings.mirror || 'nhentai.net';
    const cookiesString = settings.sessionCookies;
    if (!cookiesString) {
        debugLog('Error: No session cookies configured');
        return { success: false, error: 'No session cookies. Please log in.' };
    }

    try {
        // 1. Sync cookies to session first
        const cookiePairs = cookiesString.split(';').map(p => p.trim()).filter(Boolean);
        for (const pair of cookiePairs) {
            const eqIdx = pair.indexOf('=');
            if (eqIdx === -1) continue;
            const name = pair.substring(0, eqIdx).trim();
            const value = pair.substring(eqIdx + 1).trim();
            await session.defaultSession.cookies.set({
                url: `https://${domain}`,
                name,
                value,
                domain: `.${domain}`,
                path: '/'
            });
        }

        // 2. Extract CSRF token from session cookies or cookie string
        let csrfToken = '';
        const csrfMatch = cookiesString.match(/csrftoken=([^;]+)/);
        if (csrfMatch) {
            csrfToken = csrfMatch[1].trim();
            debugLog(`Found CSRF token in settings cookies string: ${csrfToken}`);
        } else {
            const sessionCookiesList = await session.defaultSession.cookies.get({ url: `https://${domain}`, name: 'csrftoken' });
            if (sessionCookiesList.length > 0) {
                csrfToken = sessionCookiesList[0].value;
                debugLog(`Found CSRF token in default session cookies: ${csrfToken}`);
            }
        }

        let cookieToSend = cookiesString;

        if (!csrfToken) {
            debugLog('CSRF token not found in cookies, fetching page to generate it...');
            const getHeaders = {
                'User-Agent': app.userAgentFallback,
                'Cookie': cookiesString,
                'Referer': `https://${domain}/`
            };
            const getResponse = await net.fetch(`https://${domain}/g/${galleryId}/`, { headers: getHeaders });
            debugLog(`Fetched page response status: ${getResponse.status}`);
            
            // Log all cookies in the session store to debug
            const allSessionCookies = await session.defaultSession.cookies.get({ url: `https://${domain}` });
            debugLog(`All session cookies: ${JSON.stringify(allSessionCookies.map(c => `${c.name}=${c.value} (domain: ${c.domain})`))}`);

            const retryCookies = await session.defaultSession.cookies.get({ url: `https://${domain}`, name: 'csrftoken' });
            if (retryCookies.length > 0) {
                csrfToken = retryCookies[0].value;
                debugLog(`CSRF token generated after fetch retry: ${csrfToken}`);
                cookieToSend = `${cookiesString}; csrftoken=${csrfToken}`;
            }
        }

        if (!csrfToken) {
            debugLog('Warning: Could not resolve CSRF token, proceeding without it...');
        }

        // Try to get access_token to append Authorization Bearer header
        const tokenMatch = cookiesString.match(/access_token=([^;]+)/);
        const accessToken = tokenMatch ? tokenMatch[1].trim() : '';
        if (accessToken) {
            debugLog('Found access_token in cookies, adding Authorization Bearer header');
        }

        // 3. Post to favorite toggle endpoint
        const postUrl = `https://${domain}/g/${galleryId}/favorite/`;
        debugLog(`POSTing to favorite endpoint: ${postUrl}`);
        
        const postHeaders = {
            'User-Agent': app.userAgentFallback,
            'Cookie': cookieToSend,
            'Referer': `https://${domain}/g/${galleryId}/`,
            'Content-Type': 'application/x-www-form-urlencoded'
        };

        if (csrfToken) {
            postHeaders['X-CSRFToken'] = csrfToken;
        }

        if (accessToken) {
            postHeaders['Authorization'] = `Bearer ${accessToken}`;
        }

        const body = new URLSearchParams();
        if (csrfToken) {
            body.append('csrfmiddlewaretoken', csrfToken);
        }

        const postResponse = await net.fetch(postUrl, {
            method: 'POST',
            headers: postHeaders,
            body: body.toString(),
            redirect: 'manual'
        });

        const respText = await postResponse.text();
        debugLog(`POST response status: ${postResponse.status}`);
        debugLog(`POST response headers: ${JSON.stringify([...postResponse.headers.entries()])}`);
        debugLog(`POST response body sample: ${respText.substring(0, 500)}`);
        
        return { success: true };
    } catch (e) {
        debugLog(`Exception in toggleOnlineFavorite: ${e.message}\n${e.stack}`);
        console.error(`Failed to toggle online favorite for ${galleryId}:`, e);
        return { success: false, error: e.message };
    }
}

ipcMain.handle('toggle-favorite', async (event, gallery) => {
    const list = loadJSON(favoritesPath, []);
    const index = list.findIndex(item => item.id === gallery.id);
    let favorited = false;
    if (index > -1) {
        list.splice(index, 1);
    } else {
        list.push(gallery);
        favorited = true;
    }
    saveJSON(favoritesPath, list);

    return favorited;
});

// Bookmarks IPCs
ipcMain.handle('get-bookmarks', () => {
    return loadJSON(bookmarksPath, []);
});

ipcMain.handle('toggle-bookmark', (event, bookmark) => {
    // bookmark schema: { galleryId, title, coverUrl, pageNumber }
    const list = loadJSON(bookmarksPath, []);
    const index = list.findIndex(item => item.galleryId === bookmark.galleryId && item.pageNumber === bookmark.pageNumber);
    let bookmarked = false;
    if (index > -1) {
        list.splice(index, 1);
    } else {
        list.push(bookmark);
        bookmarked = true;
    }
    saveJSON(bookmarksPath, list);
    return bookmarked;
});

// API Network Proxy (Bypassing block via DoH)
ipcMain.handle('fetch-api', async (event, url, options = {}) => {
    const settings = loadJSON(settingsPath, defaultSettings);
    const headers = options.headers || {};
    
    // Inject Authorization header if Api Key is present
    if (settings.apiKey) {
        headers['Authorization'] = `Key ${settings.apiKey.trim()}`;
    }

    // Inject session Cookies if present (Login session)
    if (settings.sessionCookies) {
        headers['Cookie'] = settings.sessionCookies;
    }

    try {
        console.log(`API proxy request to: ${url}`);
        const result = await dohClient.fetchJson(url, { ...options, headers });
        return { success: true, data: result };
    } catch (e) {
        console.error(`API proxy error for ${url}:`, e.message);
        return { success: false, error: e.message };
    }
});

// Browser utility
ipcMain.handle('open-in-browser', (event, url) => {
    shell.openExternal(url);
    return true;
});

ipcMain.handle('copy-to-clipboard', (event, text) => {
    clipboard.writeText(text);
    return true;
});

ipcMain.handle('select-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    if (!result.canceled && result.filePaths.length > 0) {
        return result.filePaths[0];
    }
    return null;
});


// Downloads Manager
ipcMain.handle('get-downloads', () => {
    const list = loadJSON(downloadsMetaPath, []);
    let updated = false;
    for (const item of list) {
        if (item.status === 'completed' && (!item.localPath || !fs.existsSync(item.localPath))) {
            item.status = 'failed';
            item.progress = 0;
            item.error = 'Local files were deleted or moved.';
            updated = true;
        }
    }
    if (updated) {
        saveJSON(downloadsMetaPath, list);
    }
    return list;
});

ipcMain.handle('delete-download', (event, galleryId) => {
    const list = loadJSON(downloadsMetaPath, []);
    const item = list.find(d => d.id === galleryId);
    if (!item) return false;

    // Delete local directory
    if (fs.existsSync(item.localPath)) {
        try {
            fs.rmSync(item.localPath, { recursive: true, force: true });
        } catch (e) {
            console.error(`Error deleting folder ${item.localPath}:`, e);
        }
    }

    // Remove from index list
    const filtered = list.filter(d => d.id !== galleryId);
    saveJSON(downloadsMetaPath, filtered);
    return true;
});

// Scan and queue pending/unfinished downloads on startup
function initializeDownloadQueue() {
    const list = loadJSON(downloadsMetaPath, []);
    let updated = false;
    for (const item of list) {
        if (item.status === 'queued' || item.status === 'downloading') {
            item.status = 'queued';
            if (!downloadQueue.some(q => q.id === item.id)) {
                downloadQueue.push(item);
            }
            updated = true;
        }
    }
    if (updated) {
        saveJSON(downloadsMetaPath, list);
    }
}

// Process download queue worker
function processQueue() {
    if (!isQueueRunning) {
        console.log('Download queue is idle. Waiting for start-download-queue IPC.');
        return;
    }

    const settings = loadJSON(settingsPath, defaultSettings);
    const maxConcurrent = settings.maxConcurrentDownloads || 2;
    const activeCount = Object.keys(activeDownloads).length;

    if (activeCount >= maxConcurrent) {
        console.log(`Queue: Max active downloads reached (${activeCount}/${maxConcurrent})`);
        return;
    }

    // Find the next queued item that is not already active
    const nextItem = downloadQueue.find(item => !activeDownloads[item.id]);
    if (!nextItem) {
        console.log('Queue: No pending queued items.');
        return;
    }

    console.log(`Queue: starting item ${nextItem.id}`);
    
    // Update status to downloading in downloads.json
    const list = loadJSON(downloadsMetaPath, []);
    const idx = list.findIndex(d => d.id === nextItem.id);
    if (idx > -1) {
        list[idx].status = 'downloading';
        saveJSON(downloadsMetaPath, list);
    }

    runDownloader(nextItem);

    // Recursively check if we have more slots and more queued items
    setTimeout(processQueue, 100);
}

// Start download queue IPC
ipcMain.handle('start-download-queue', (event) => {
    isQueueRunning = true;
    
    // Send immediate progress updates to refresh UI list
    const list = loadJSON(downloadsMetaPath, []);
    for (const item of list) {
        if (item.status === 'queued') {
            if (mainWindow) {
                mainWindow.webContents.send('download-progress', {
                    galleryId: item.id,
                    progress: 0,
                    status: 'queued'
                });
            }
        }
    }

    processQueue();
    return true;
});

// Trigger download in background queue
ipcMain.handle('download-gallery', async (event, gallery) => {
    const settings = loadJSON(settingsPath, defaultSettings);
    const downloadsList = loadJSON(downloadsMetaPath, []);

    // Check if already downloaded
    const existing = downloadsList.find(d => d.id === gallery.id);
    if (existing && existing.status === 'completed') {
        return { status: 'completed', localPath: existing.localPath };
    }

    // Create target directory
    const folderName = getFormattedName(gallery);
    const localFolder = path.join(settings.downloadPath, folderName);
    
    if (!fs.existsSync(localFolder)) {
        fs.mkdirSync(localFolder, { recursive: true });
    }

    // Save metadata JSON
    const metaFile = path.join(localFolder, 'metadata.json');
    fs.writeFileSync(metaFile, JSON.stringify(gallery, null, 2), 'utf8');

    // Add to download index list
    const downloadItem = {
        id: gallery.id,
        title: gallery.title,
        cover: gallery.cover,
        pages: gallery.pages,
        num_pages: gallery.num_pages,
        localPath: localFolder,
        status: 'queued',
        progress: 0
    };

    const index = downloadsList.findIndex(d => d.id === gallery.id);
    if (index > -1) {
        downloadsList[index] = downloadItem;
    } else {
        downloadsList.push(downloadItem);
    }
    saveJSON(downloadsMetaPath, downloadsList);

    // Push to pending queue
    if (!downloadQueue.some(item => item.id === gallery.id)) {
        downloadQueue.push(downloadItem);
    }

    // Report queued progress via IPC
    if (mainWindow) {
        mainWindow.webContents.send('download-progress', {
            galleryId: gallery.id,
            progress: 0,
            status: 'queued'
        });
    }

    // Process queue
    processQueue();

    return { status: 'queued', progress: 0 };
});

ipcMain.handle('pause-download', (event, galleryId) => {
    console.log(`IPC pause-download called for gallery ${galleryId}`);
    if (activeDownloads[galleryId]) {
        pausedDownloads[galleryId] = true;
        return true;
    }
    const index = downloadQueue.findIndex(q => q.id === galleryId);
    if (index > -1) {
        downloadQueue.splice(index, 1);
    }
    const list = loadJSON(downloadsMetaPath, []);
    const item = list.find(d => d.id === galleryId);
    if (item) {
        item.status = 'paused';
        saveJSON(downloadsMetaPath, list);
        if (mainWindow) {
            mainWindow.webContents.send('download-progress', {
                galleryId: galleryId,
                progress: item.progress || 0,
                status: 'paused'
            });
        }
    }
    return true;
});

ipcMain.handle('resume-download', (event, galleryId) => {
    console.log(`IPC resume-download called for gallery ${galleryId}`);
    delete pausedDownloads[galleryId];
    delete cancelledDownloads[galleryId];

    const list = loadJSON(downloadsMetaPath, []);
    const item = list.find(d => d.id === galleryId);
    if (item) {
        item.status = 'queued';
        saveJSON(downloadsMetaPath, list);
        if (!downloadQueue.some(q => q.id === galleryId)) {
            downloadQueue.push(item);
        }
        if (mainWindow) {
            mainWindow.webContents.send('download-progress', {
                galleryId: galleryId,
                progress: item.progress || 0,
                status: 'queued'
            });
        }
        processQueue();
        return true;
    }
    return false;
});

ipcMain.handle('cancel-download', (event, galleryId) => {
    console.log(`IPC cancel-download called for gallery ${galleryId}`);
    if (activeDownloads[galleryId]) {
        cancelledDownloads[galleryId] = true;
        return true;
    }
    const index = downloadQueue.findIndex(q => q.id === galleryId);
    if (index > -1) {
        downloadQueue.splice(index, 1);
    }
    const list = loadJSON(downloadsMetaPath, []);
    const item = list.find(d => d.id === galleryId);
    if (item) {
        item.status = 'failed';
        saveJSON(downloadsMetaPath, list);
        if (mainWindow) {
            mainWindow.webContents.send('download-progress', {
                galleryId: galleryId,
                progress: item.progress || 0,
                status: 'failed'
            });
        }
    }
    return true;
});

ipcMain.handle('pause-all-downloads', () => {
    console.log('IPC pause-all-downloads called');
    for (const id of Object.keys(activeDownloads)) {
        pausedDownloads[id] = true;
    }
    downloadQueue = [];
    
    const list = loadJSON(downloadsMetaPath, []);
    let updated = false;
    for (const item of list) {
        if (item.status === 'downloading' || item.status === 'queued') {
            item.status = 'paused';
            updated = true;
            if (mainWindow) {
                mainWindow.webContents.send('download-progress', {
                    galleryId: item.id,
                    progress: item.progress || 0,
                    status: 'paused'
                });
            }
        }
    }
    if (updated) {
        saveJSON(downloadsMetaPath, list);
    }
    return true;
});

ipcMain.handle('cancel-all-downloads', () => {
    console.log('IPC cancel-all-downloads called');
    for (const id of Object.keys(activeDownloads)) {
        cancelledDownloads[id] = true;
    }
    downloadQueue = [];
    
    const list = loadJSON(downloadsMetaPath, []);
    let updated = false;
    for (const item of list) {
        if (item.status === 'downloading' || item.status === 'queued') {
            item.status = 'failed';
            updated = true;
            if (mainWindow) {
                mainWindow.webContents.send('download-progress', {
                    galleryId: item.id,
                    progress: item.progress || 0,
                    status: 'failed'
                });
            }
        }
    }
    if (updated) {
        saveJSON(downloadsMetaPath, list);
    }
    return true;
});

ipcMain.handle('delete-all-downloads', () => {
    console.log('IPC delete-all-downloads called');
    for (const id of Object.keys(activeDownloads)) {
        cancelledDownloads[id] = true;
    }
    downloadQueue = [];
    
    const list = loadJSON(downloadsMetaPath, []);
    for (const item of list) {
        if (fs.existsSync(item.localPath)) {
            try {
                fs.rmSync(item.localPath, { recursive: true, force: true });
            } catch (e) {
                console.error(`Failed to delete local path ${item.localPath}:`, e.message);
            }
        }
        if (mainWindow) {
            mainWindow.webContents.send('download-progress', {
                galleryId: item.id,
                progress: 0,
                status: 'deleted'
            });
        }
    }
    saveJSON(downloadsMetaPath, []);
    return true;
});

async function runDownloader(downloadItem) {
    const { id, pages, localPath } = downloadItem;
    activeDownloads[id] = downloadItem;

    console.log(`Starting download for gallery ${id}...`);
    let downloadedCount = 0;

    // Save cover image
    if (downloadItem.cover && downloadItem.cover.path) {
        const coverName = downloadItem.cover.path.split('/').pop() || 'cover.jpg';
        const coverFile = path.join(localPath, coverName);
        if (!fs.existsSync(coverFile)) {
            try {
                const settings = loadJSON(settingsPath, defaultSettings);
                const hostPrefix = 't1.' + settings.mirror;
                const coverUrl = `https://${hostPrefix}/${downloadItem.cover.path}`;
                const buffer = await dohClient.fetchBuffer(coverUrl);
                fs.writeFileSync(coverFile, buffer);
                console.log(`Downloaded cover for gallery ${id} to ${coverFile}`);
            } catch (e) {
                console.error(`Failed to download cover for gallery ${id}:`, e.message);
            }
        }
    }
    
    // Save pages one by one
    for (let i = 0; i < pages.length; i++) {
        if (cancelledDownloads[id]) {
            console.log(`runDownloader: Gallery ${id} download cancelled`);
            delete activeDownloads[id];
            delete cancelledDownloads[id];
            downloadQueue = downloadQueue.filter(q => q.id !== id);
            
            const list = loadJSON(downloadsMetaPath, []);
            const item = list.find(d => d.id === id);
            if (item) {
                item.status = 'failed';
                saveJSON(downloadsMetaPath, list);
            }
            if (mainWindow) {
                mainWindow.webContents.send('download-progress', {
                    galleryId: id,
                    progress: item ? item.progress : 0,
                    status: 'failed'
                });
            }
            processQueue();
            return;
        }

        if (pausedDownloads[id]) {
            console.log(`runDownloader: Gallery ${id} download paused`);
            delete activeDownloads[id];
            delete pausedDownloads[id];
            downloadQueue = downloadQueue.filter(q => q.id !== id);
            
            const list = loadJSON(downloadsMetaPath, []);
            const item = list.find(d => d.id === id);
            if (item) {
                item.status = 'paused';
                item.progress = Math.round((downloadedCount / pages.length) * 100);
                saveJSON(downloadsMetaPath, list);
            }
            if (mainWindow) {
                mainWindow.webContents.send('download-progress', {
                    galleryId: id,
                    progress: Math.round((downloadedCount / pages.length) * 100),
                    status: 'paused'
                });
            }
            processQueue();
            return;
        }

        const page = pages[i];
        const pageNum = page.number;
        const pageExt = page.path.split('.').pop() || 'webp';
        const pageFile = path.join(localPath, `${pageNum}.${pageExt}`);

        // Skip if already exists
        if (fs.existsSync(pageFile)) {
            downloadedCount++;
            continue;
        }

        try {
            // Path is e.g. galleries/4011896/1.webp
            // Base URL prefix for page images: i1.nhentai.net (or configurable)
            const settings = loadJSON(settingsPath, defaultSettings);
            const hostPrefix = 'i1.' + settings.mirror;
            const imageUrl = `https://${hostPrefix}/${page.path}`;

            const startTime = Date.now();
            const buffer = await dohClient.fetchBuffer(imageUrl);
            const timeElapsed = Date.now() - startTime;

            fs.writeFileSync(pageFile, buffer);
            downloadedCount++;

            // Throttling speed limit if defined (settings.downloadSpeedLimit is number in KB/s)
            const speedLimit = settings.downloadSpeedLimit || 0;
            if (speedLimit > 0) {
                const limitBytesPerSec = speedLimit * 1024;
                const minTimeMs = (buffer.length / limitBytesPerSec) * 1000;
                const delayMs = minTimeMs - timeElapsed;
                if (delayMs > 0) {
                    await new Promise(r => setTimeout(r, delayMs));
                }
            }

            // Report progress
            const progress = Math.round((downloadedCount / pages.length) * 100);
            downloadItem.progress = progress;

            if (mainWindow) {
                mainWindow.webContents.send('download-progress', {
                    galleryId: id,
                    progress: progress,
                    status: 'downloading'
                });
            }
        } catch (e) {
            console.error(`Failed to download page ${pageNum} for gallery ${id}:`, e.message);
            // Wait a bit and retry once
            try {
                await new Promise(r => setTimeout(r, 2000));
                const settings = loadJSON(settingsPath, defaultSettings);
                const hostPrefix = 'i1.' + settings.mirror;
                const imageUrl = `https://${hostPrefix}/${page.path}`;
                const buffer = await dohClient.fetchBuffer(imageUrl);
                fs.writeFileSync(pageFile, buffer);
                downloadedCount++;
            } catch (retryError) {
                console.error(`Retry failed for page ${pageNum} for gallery ${id}:`, retryError.message);
            }
        }
    }

    // Done
    delete activeDownloads[id];
    downloadQueue = downloadQueue.filter(q => q.id !== id);

    const downloadsList = loadJSON(downloadsMetaPath, []);
    const item = downloadsList.find(d => d.id === id);
    if (item) {
        item.status = downloadedCount === pages.length ? 'completed' : 'failed';
        item.progress = Math.round((downloadedCount / pages.length) * 100);
        
        // Re-write exact page paths as local file paths for offline loading
        // We will store relative names so the reader knows which local file to load
        const updatedPages = pages.map(p => {
            const ext = p.path.split('.').pop() || 'webp';
            return {
                ...p,
                localFile: `${p.number}.${ext}`
            };
        });
        
        // Update metadata.json with local pages reference
        const metaFile = path.join(localPath, 'metadata.json');
        try {
            const metaContent = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
            metaContent.pages = updatedPages;
            fs.writeFileSync(metaFile, JSON.stringify(metaContent, null, 2), 'utf8');
        } catch (e) {
            console.error('Failed to update downloaded metadata.json:', e);
        }

        saveJSON(downloadsMetaPath, downloadsList);

        if (mainWindow) {
            mainWindow.webContents.send('download-progress', {
                galleryId: id,
                progress: item.progress,
                status: item.status,
                localPath: localPath
            });
        }
    }
    processQueue();
}

// PDF Conversion Handler
ipcMain.handle('export-to-pdf', async (event, gallery) => {
    const defaultName = `${getFormattedName(gallery)}.pdf`;
    const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Export to PDF',
        defaultPath: path.join(app.getPath('documents'), defaultName),
        filters: [
            { name: 'PDF Document', extensions: ['pdf'] }
        ]
    });

    if (result.canceled || !result.filePath) {
        return { status: 'cancelled' };
    }

    const savePath = result.filePath;
    
    // Add job to the PDF conversion queue
    pdfQueue.push({ gallery, savePath });
    
    // Trigger PDF queue processing
    processPdfQueue();

    return { status: 'queued', savePath };
});

ipcMain.handle('export-all-to-pdf', async () => {
    try {
        const settings = loadJSON(settingsPath, defaultSettings);
        let saveDir = settings.pdfSaveDir || '';
        if (!saveDir || !fs.existsSync(saveDir)) {
            saveDir = app.getPath('downloads');
        }

        const list = loadJSON(downloadsMetaPath, []);
        const completedItems = list.filter(d => d.status === 'completed');
        if (completedItems.length === 0) {
            return { success: false, error: 'No completed downloads found.' };
        }

        let queuedCount = 0;
        for (const item of completedItems) {
            const defaultName = `${getFormattedName(item)}.pdf`;
            const savePath = path.join(saveDir, defaultName);
            
            if (!pdfQueue.some(q => q.gallery.id === item.id)) {
                pdfQueue.push({ gallery: item, savePath });
                queuedCount++;
            }
        }

        if (queuedCount > 0) {
            processPdfQueue();
        }

        return { success: true, count: queuedCount, saveDir };
    } catch (e) {
        console.error('Export all to PDF error:', e);
        return { success: false, error: e.message };
    }
});

async function processPdfQueue() {
    if (isPdfProcessing) {
        console.log('PDF: A conversion is already in progress. Waiting in queue.');
        return;
    }

    if (pdfQueue.length === 0) {
        console.log('PDF: Queue is empty.');
        return;
    }

    isPdfProcessing = true;
    const { gallery, savePath } = pdfQueue[0];
    
    console.log(`PDF: Starting conversion for gallery ${gallery.id} to ${savePath}`);
    sendPdfProgress(gallery.id, 0, 'processing');

    try {
        await generatePdfFromOfflineGallery(gallery, savePath);
        console.log(`PDF: Successfully converted gallery ${gallery.id}`);
        sendPdfProgress(gallery.id, 100, 'completed', savePath);
    } catch (err) {
        console.error(`PDF: Failed to convert gallery ${gallery.id}:`, err);
        sendPdfProgress(gallery.id, 0, 'failed', '', err.message);
    } finally {
        pdfQueue.shift();
        isPdfProcessing = false;
        
        // Process next item
        processPdfQueue();
    }
}

function sendPdfProgress(galleryId, progress, status, savePath = '', error = '') {
    if (mainWindow) {
        mainWindow.webContents.send('pdf-progress', {
            galleryId,
            progress,
            status,
            savePath,
            error
        });
    }
}

function generatePdfFromOfflineGallery(gallery, savePath) {
    return new Promise((resolve, reject) => {
        try {
            const metaFile = path.join(gallery.localPath, 'metadata.json');
            if (!fs.existsSync(metaFile)) {
                return reject(new Error('Local metadata.json not found.'));
            }
            const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
            const pages = meta.pages || [];
            if (pages.length === 0) {
                return reject(new Error('No pages found in metadata.json'));
            }

            const imagePaths = pages.map(p => {
                const ext = p.path.split('.').pop() || 'webp';
                const fileName = p.localFile || `${p.number}.${ext}`;
                const absolutePath = path.join(gallery.localPath, fileName).replace(/\\/g, '/');
                return `file:///${absolutePath}`;
            });

            const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    @page {
                        margin: 0;
                        size: auto;
                    }
                    body {
                        margin: 0;
                        padding: 0;
                        background: #fff;
                    }
                    img {
                        width: 100%;
                        height: auto;
                        display: block;
                        page-break-after: always;
                    }
                </style>
            </head>
            <body>
                ${imagePaths.map((src, index) => `<img src="${src}" id="img-${index}" />`).join('')}
                <script>
                    window.allImagesLoaded = false;
                    const images = Array.from(document.querySelectorAll('img'));
                    let loadedCount = 0;
                    function checkAllLoaded() {
                        loadedCount++;
                        if (loadedCount === images.length) {
                            window.allImagesLoaded = true;
                        }
                    }
                    images.forEach(img => {
                        if (img.complete) {
                            checkAllLoaded();
                        } else {
                            img.onload = checkAllLoaded;
                            img.onerror = checkAllLoaded;
                        }
                    });
                </script>
            </body>
            </html>
            `;

            // Create hidden BrowserWindow
            const printWindow = new BrowserWindow({
                show: false,
                webPreferences: {
                    webSecurity: false, // allow loading local file:/// paths
                    contextIsolation: true,
                    nodeIntegration: false
                }
            });

            printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

            printWindow.webContents.once('did-finish-load', async () => {
                try {
                    let attempts = 0;
                    const waitForImages = async () => {
                        const loaded = await printWindow.webContents.executeJavaScript('window.allImagesLoaded');
                        if (loaded || attempts > 100) { // 10s max timeout fallback
                            return;
                        }
                        attempts++;
                        await new Promise(r => setTimeout(r, 100));
                        return waitForImages();
                    };
                    await waitForImages();

                    // Print to PDF
                    const pdfBuffer = await printWindow.webContents.printToPDF({
                        margins: { marginType: 'none' },
                        pageSize: 'A4',
                        printBackground: true
                    });

                    fs.writeFileSync(savePath, pdfBuffer);
                    printWindow.destroy();
                    resolve();
                } catch (e) {
                    printWindow.destroy();
                    reject(e);
                }
            });
        } catch (e) {
            reject(e);
        }
    });
}
