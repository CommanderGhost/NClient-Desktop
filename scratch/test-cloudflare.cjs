const https = require('https');
const urlModule = require('url');

function testDirectCf() {
    const targetUrl = 'https://t1.nhentai.net/galleries/659460/cover.jpg';
    const cfIp = '104.26.4.188'; // Cloudflare CDN IP
    
    console.log(`Testing direct fetch from CF IP ${cfIp}...`);
    
    const parsedUrl = urlModule.parse(targetUrl);
    const reqOptions = {
        hostname: cfIp,
        port: 443,
        path: parsedUrl.path,
        method: 'GET',
        headers: {
            'Host': 't1.nhentai.net',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
        },
        servername: 't1.nhentai.net',
        rejectUnauthorized: false
    };

    const req = https.request(reqOptions, (res) => {
        console.log(`Status Code: ${res.statusCode}`);
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
            console.log(`Finished! Size: ${Buffer.concat(chunks).length} bytes`);
        });
    });

    req.on('error', (err) => {
        console.error('Request failed:', err);
    });

    req.end();
}

testDirectCf();
