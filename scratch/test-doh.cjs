const dohClient = require('../doh-client.cjs');

async function run() {
    const testUrl = 'https://t1.nhentai.net/galleries/659460/cover.jpg';
    console.log(`Attempting to fetch image from: ${testUrl}`);
    try {
        console.log('Resolving DNS...');
        const ips = await dohClient.resolveDoh('t1.nhentai.net');
        console.log('Resolved IPs:', ips);

        console.log('Fetching image buffer...');
        const buffer = await dohClient.fetchBuffer(testUrl);
        console.log(`Successfully fetched buffer! Size: ${buffer.length} bytes`);
    } catch (err) {
        console.error('Error during test:', err);
    }
}

run();
