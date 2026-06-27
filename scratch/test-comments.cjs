const dohClient = require('../doh-client.cjs');

async function testUrl(url) {
    console.log(`Testing URL: ${url}`);
    try {
        const data = await dohClient.fetchJson(url);
        console.log(`  Success! Data size: ${Array.isArray(data) ? data.length : typeof data}`);
        console.log(JSON.stringify(Array.isArray(data) ? data.slice(0, 2) : data, null, 2));
        return true;
    } catch (err) {
        console.log(`  Failed: ${err.message}`);
        return false;
    }
}

async function run() {
    const galleryId = 489401;
    const urls = [
        `https://nhentai.net/api/v2/galleries/${galleryId}/comments`,
        `https://nhentai.net/api/v2/gallery/${galleryId}/comments`,
        `https://nhentai.net/api/v2/comments/${galleryId}`
    ];

    for (const url of urls) {
        const ok = await testUrl(url);
        if (ok) break;
    }
}

run();
