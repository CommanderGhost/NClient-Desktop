const https = require('https');
const http = require('http');
const urlModule = require('url');

const dnsCache = {};

// Resolve domain names using Cloudflare DoH (DNS-over-HTTPS)
async function resolveDoh(domain) {
    // If it's nhentai domain or CDN, map directly to known Cloudflare CDN IPs
    // to bypass poisoned/blocked origin IPs like 77.247.178.1 that timeout.
    if (domain.toLowerCase().includes('nhentai.net')) {
        return ['104.26.4.188', '104.26.5.188', '172.67.74.203'];
    }

    if (dnsCache[domain]) {
        return dnsCache[domain];
    }
    
    // Avoid DoH resolving if it's already an IP address
    if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(domain)) {
        return [domain];
    }

    const resolvers = [
        `https://1.1.1.1/dns-query?name=${encodeURIComponent(domain)}&type=A`,
        `https://1.0.0.1/dns-query?name=${encodeURIComponent(domain)}&type=A`,
        `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=A`
    ];

    for (const dohUrl of resolvers) {
        try {
            const response = await fetch(dohUrl, {
                headers: { 'accept': 'application/dns-json' },
                signal: AbortSignal.timeout(3000)
            });
            const json = await response.json();
            if (json.Answer && json.Answer.length > 0) {
                const ips = json.Answer.filter(ans => ans.type === 1).map(ans => ans.data);
                if (ips.length > 0) {
                    dnsCache[domain] = ips;
                    return ips;
                }
            }
        } catch (e) {
            console.error(`DoH resolution failed for ${domain} via ${dohUrl}:`, e.message);
        }
    }
    
    // Fallback to standard DNS resolve (system will handle it, though it might be censored)
    return [domain];
}

// Perform an HTTPS request with TLS servername override to bypass SNI block
function secureRequest(targetUrl, options = {}) {
    return new Promise(async (resolve, reject) => {
        try {
            const parsedUrl = urlModule.parse(targetUrl);
            const domain = parsedUrl.hostname;
            const ips = await resolveDoh(domain);
            const ip = ips[0];

            const chromeVersion = process.versions.chrome;
            const defaultUserAgent = chromeVersion 
                ? `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`
                : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

            const headers = {
                'Host': domain,
                'User-Agent': defaultUserAgent,
                ...(options.headers || {})
            };

            // Remove host header if it is duplicate
            Object.keys(headers).forEach(k => {
                if (k.toLowerCase() === 'host') {
                    delete headers[k];
                    headers['Host'] = domain;
                }
            });

            const reqOptions = {
                hostname: ip,
                port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
                path: parsedUrl.path,
                method: options.method || 'GET',
                headers: headers,
                servername: domain, // Crucial: sets SNI extension to real host
                timeout: 10000,
                // Accept self-signed or mismatching certificates if necessary, but try to validate by default
                rejectUnauthorized: false 
            };

            const client = parsedUrl.protocol === 'https:' ? https : http;

            const req = client.request(reqOptions, (res) => {
                // Handle redirection (301, 302)
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    let nextUrl = res.headers.location;
                    if (!nextUrl.startsWith('http')) {
                        nextUrl = `${parsedUrl.protocol}//${domain}${nextUrl}`;
                    }
                    console.log(`Redirecting to ${nextUrl}...`);
                    secureRequest(nextUrl, options).then(resolve).catch(reject);
                    return;
                }

                resolve(res);
            });

            req.on('error', (err) => {
                reject(err);
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            if (options.body) {
                req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
            }
            req.end();
        } catch (e) {
            reject(e);
        }
    });
}

// Fetch JSON data over DoH
async function fetchJson(targetUrl, options = {}) {
    const res = await secureRequest(targetUrl, options);
    return new Promise((resolve, reject) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            if (res.statusCode >= 400) {
                reject(new Error(`HTTP Error ${res.statusCode}: ${data.substring(0, 200)}`));
                return;
            }
            try {
                resolve(JSON.parse(data));
            } catch (e) {
                reject(new Error(`Failed to parse JSON response: ${e.message}`));
            }
        });
        res.on('error', reject);
    });
}

// Fetch binary buffer data over DoH (e.g. images)
async function fetchBuffer(targetUrl, options = {}) {
    const res = await secureRequest(targetUrl, options);
    return new Promise((resolve, reject) => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
            if (res.statusCode >= 400) {
                reject(new Error(`HTTP Error ${res.statusCode}`));
                return;
            }
            resolve(Buffer.concat(chunks));
        });
        res.on('error', reject);
    });
}

module.exports = {
    resolveDoh,
    secureRequest,
    fetchJson,
    fetchBuffer
};
