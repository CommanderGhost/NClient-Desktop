const https = require('https');
const dohClient = require('../doh-client.cjs');

async function testEndpoint(path) {
    try {
        console.log(`Testing endpoint: ${path}`);
        const result = await dohClient.fetchJson(`https://nhentai.net${path}`);
        console.log(`Success! Result keys:`, Object.keys(result));
        if (result.result) {
            console.log(`Result items count: ${result.result.length}`);
            console.log(`First item title:`, result.result[0].english_title || result.result[0].title?.pretty);
        } else {
            console.log(`Result preview:`, JSON.stringify(result).substring(0, 200));
            if (Array.isArray(result) && result.length > 0) {
                console.log(`First element keys:`, Object.keys(result[0]));
                console.log(`First element full object:`, JSON.stringify(result[0], null, 2));
            } else if (result[0]) {
                console.log(`First element keys (obj):`, Object.keys(result[0]));
            }
        }
    } catch (e) {
        console.log(`Failed for ${path}:`, e.message);
    }
}

async function run() {
    await testEndpoint('/api/v2/galleries?sort=popular');
    await testEndpoint('/api/v2/galleries?sort=popular-today');
    await testEndpoint('/api/v2/galleries?sort=popular-week');
    await testEndpoint('/api/v2/galleries/popular');
    await testEndpoint('/api/v2/popular');
}

run();
