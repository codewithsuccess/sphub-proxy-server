// // with api
const express = require("express");
const cors = require("cors");
const { request } = require("undici");

const app = express();
app.use(cors());
app.use(express.json()); // Add JSON body parser for API requests with JSON payloads

// Trust the proxy to get accurate protocol info
app.set('trust proxy', true);

// New route to handle general API proxying
app.all("/api-proxy", async (req, res) => {
    const targetUrl = req.query.url;

    if (!targetUrl) {
        return res.status(400).json({ error: "Target URL is required as a query parameter" });
    }

    try {
        console.log(`Proxying API request to: ${targetUrl}`);
        console.log(`Method: ${req.method}`);

        // Forward headers but exclude some that might cause issues
        const headers = { ...req.headers };
        delete headers.host;
        delete headers.connection;

        // Add common headers for API requests
        headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

        const requestOptions = {
            method: req.method,
            headers: headers,
            body: ["GET", "HEAD"].includes(req.method) ? undefined : JSON.stringify(req.body)
        };

        // Forward the request to the target API
        const apiResponse = await request(targetUrl, requestOptions);

        // Copy response headers
        const responseHeaders = apiResponse.headers;
        for (const [key, value] of Object.entries(responseHeaders)) {
            // Skip headers that might cause issues
            if (!["connection", "transfer-encoding"].includes(key.toLowerCase())) {
                res.setHeader(key, value);
            }
        }

        // Set status code
        res.status(apiResponse.statusCode);

        // Determine response format and send accordingly
        const contentType = responseHeaders["content-type"] || "";

        if (contentType.includes("application/json")) {
            const jsonData = await apiResponse.body.json();
            res.json(jsonData);
        } else if (contentType.includes("text/")) {
            const textData = await apiResponse.body.text();
            res.send(textData);
        } else {
            // For binary data or other formats
            const buffer = await apiResponse.body.arrayBuffer();
            res.send(Buffer.from(buffer));
        }
    } catch (err) {
        console.error("API proxy error:", err.message);
        res.status(500).json({ error: `Failed to proxy API request: ${err.message}` });
    }
});

// Add documentation to the homepage
app.get("/", (req, res) => {
    // Get server origin (protocol + host)
    const serverOrigin = `${req.protocol}://${req.get('host')}`;

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>M3U8 Stream & API Proxy</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                max-width: 800px;
                margin: 0 auto;
                padding: 20px;
                line-height: 1.6;
            }
            .form-group {
                margin-bottom: 15px;
            }
            label {
                display: block;
                margin-bottom: 5px;
                font-weight: bold;
            }
            input[type="text"] {
                width: 100%;
                padding: 8px;
                box-sizing: border-box;
                border: 1px solid #ddd;
                border-radius: 4px;
            }
            button {
                padding: 10px 15px;
                background-color: #4CAF50;
                color: white;
                border: none;
                cursor: pointer;
                border-radius: 4px;
                margin-right: 5px;
                font-size: 14px;
            }
            button:hover {
                background-color: #45a049;
            }
            .button-group {
                margin-top: 10px;
            }
            h1, h2 {
                color: #333;
            }
            .section {
                margin-top: 30px;
                padding: 15px;
                background-color: #f5f5f5;
                border-radius: 5px;
            }
            code {
                background-color: #eee;
                padding: 2px 4px;
                border-radius: 3px;
                font-family: monospace;
            }
            textarea {
                width: 100%;
                height: 80px;
                padding: 8px;
                box-sizing: border-box;
                border: 1px solid #ddd;
                border-radius: 4px;
                font-family: monospace;
            }
            .tabs {
                display: flex;
                margin-bottom: 15px;
            }
            .tab {
                padding: 10px 15px;
                background-color: #eee;
                cursor: pointer;
                border-radius: 4px 4px 0 0;
                margin-right: 5px;
            }
            .tab.active {
                background-color: #4CAF50;
                color: white;
            }
            .tab-content {
                display: none;
                padding: 15px;
                background-color: #f5f5f5;
                border-radius: 0 4px 4px 4px;
            }
            .tab-content.active {
                display: block;
            }
        </style>
    </head>
    <body>
        <h1>Stream & API Proxy</h1>

        <div class="tabs">
            <div class="tab active" onclick="switchTab('stream-tab', this)">HLS Stream Proxy</div>
            <div class="tab" onclick="switchTab('api-tab', this)">API Proxy</div>
        </div>

        <div id="stream-tab" class="tab-content active">
            <p>Enter an M3U8 URL to proxy, play, and embed:</p>

            <div class="form-group">
                <label for="m3u8-url">M3U8 URL:</label>
                <input type="text" id="m3u8-url" placeholder="https://example.com/stream.m3u8">
            </div>

            <div class="button-group">
                <button onclick="playStream()">Play Stream</button>
                <button onclick="getEmbedCode()">Get Embed Code</button>
                <button onclick="openEmbedPlayer()">Open Embed Player</button>
            </div>

            <div id="stream-result" style="display:none; margin-top:20px;">
                <h2>Embed Code</h2>
                <p>Copy and paste this code to embed the player in your website:</p>
                <textarea id="embed-code-result" readonly></textarea>

                <h2>Direct Stream URL</h2>
                <p>Use this URL in media players that support HLS:</p>
                <textarea id="direct-link-result" readonly></textarea>
            </div>
        </div>

        <div id="api-tab" class="tab-content">
            <p>Enter an API URL to proxy:</p>

            <div class="form-group">
                <label for="api-url">API URL:</label>
                <input type="text" id="api-url" placeholder="https://api.example.com/endpoint">
            </div>

            <div class="form-group">
                <label for="api-method">https Method:</label>
                <select id="api-method">
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="DELETE">DELETE</option>
                    <option value="PATCH">PATCH</option>
                </select>
            </div>

            <div class="form-group">
                <label for="api-body">Request Body (JSON):</label>
                <textarea id="api-body" placeholder='{"key": "value"}'></textarea>
            </div>

            <div class="button-group">
                <button onclick="testApiProxy()">Test API Request</button>
                <button onclick="getApiProxyUrl()">Get API Proxy URL</button>
            </div>

            <div id="api-result" style="display:none; margin-top:20px;">
                <h2>Proxy URL</h2>
                <p>Use this URL to proxy API requests:</p>
                <textarea id="api-proxy-url" readonly></textarea>

                <h2>Response</h2>
                <pre id="api-response" style="background-color: #eee; padding: 10px; border-radius: 4px; overflow: auto; max-height: 300px;"></pre>
            </div>
        </div>

        <div class="section">
            <h2>API Proxy Usage</h2>
            <p>To use the API proxy in your code:</p>
            <pre><code>// Example using fetch
fetch('${serverOrigin}/api-proxy?url=' + encodeURIComponent('https://api.example.com/endpoint'), {
    method: 'POST', // or GET, PUT, DELETE, etc.
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({ key: 'value' }) // For POST/PUT/PATCH requests
})
.then(response => response.json())
.then(data => console.log(data))
.catch(error => console.error('Error:', error));</code></pre>
        </div>

        <script>
            function switchTab(tabId, clickedTab) {
                // Hide all tabs
                document.querySelectorAll('.tab-content').forEach(tab => {
                    tab.classList.remove('active');
                });

                // Remove active class from all tab buttons
                document.querySelectorAll('.tab').forEach(tab => {
                    tab.classList.remove('active');
                });

                // Show selected tab
                document.getElementById(tabId).classList.add('active');

                // Add active class to clicked tab button
                clickedTab.classList.add('active');
            }

            function playStream() {
                const url = document.getElementById('m3u8-url').value.trim();
                if (!url) {
                    alert('Please enter a valid M3U8 URL');
                    return;
                }

                window.location.href = '/player?url=' + encodeURIComponent(url);
            }

            function getEmbedCode() {
                const url = document.getElementById('m3u8-url').value.trim();
                if (!url) {
                    alert('Please enter a valid M3U8 URL');
                    return;
                }

                const proxyUrl = '/stream?url=' + encodeURIComponent(url);
                const embedUrl = '/embed?url=' + encodeURIComponent(url);

                document.getElementById('embed-code-result').value = '<iframe src="${serverOrigin}' + embedUrl + '" width="640" height="360" frameborder="0" allowfullscreen></iframe>';
                document.getElementById('direct-link-result').value = '${serverOrigin}' + proxyUrl;

                document.getElementById('stream-result').style.display = 'block';
            }

            function openEmbedPlayer() {
                const url = document.getElementById('m3u8-url').value.trim();
                if (!url) {
                    alert('Please enter a valid M3U8 URL');
                    return;
                }

                window.open('/embed?url=' + encodeURIComponent(url), '_blank');
            }

            function testApiProxy() {
                const url = document.getElementById('api-url').value.trim();
                if (!url) {
                    alert('Please enter a valid API URL');
                    return;
                }

                const method = document.getElementById('api-method').value;
                const bodyText = document.getElementById('api-body').value.trim();
                let body = undefined;

                if (bodyText && ['POST', 'PUT', 'PATCH'].includes(method)) {
                    try {
                        body = JSON.parse(bodyText);
                    } catch (e) {
                        alert('Invalid JSON in request body');
                        return;
                    }
                }

                const proxyUrl = '/api-proxy?url=' + encodeURIComponent(url);

                fetch(proxyUrl, {
                    method: method,
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: body ? JSON.stringify(body) : undefined
                })
                .then(response => {
                    if (!response.ok) {
                        throw new Error('API request failed with status ' + response.status);
                    }
                    return response.text();
                })
                .then(data => {
                    try {
                        // Try to parse as JSON
                        const jsonData = JSON.parse(data);
                        document.getElementById('api-response').textContent = JSON.stringify(jsonData, null, 2);
                    } catch (e) {
                        // Not JSON, show as text
                        document.getElementById('api-response').textContent = data;
                    }

                    document.getElementById('api-proxy-url').value = '${serverOrigin}' + proxyUrl;
                    document.getElementById('api-result').style.display = 'block';
                })
                .catch(error => {
                    document.getElementById('api-response').textContent = 'Error: ' + error.message;
                    document.getElementById('api-proxy-url').value = '${serverOrigin}' + proxyUrl;
                    document.getElementById('api-result').style.display = 'block';
                });
            }

            function getApiProxyUrl() {
                const url = document.getElementById('api-url').value.trim();
                if (!url) {
                    alert('Please enter a valid API URL');
                    return;
                }

                const proxyUrl = '/api-proxy?url=' + encodeURIComponent(url);
                document.getElementById('api-proxy-url').value = '${serverOrigin}' + proxyUrl;
                document.getElementById('api-result').style.display = 'block';
            }
        </script>
    </body>
    </html>
    `;

    res.send(html);
});

// Add your existing routes here
// Route to handle M3U8 manifest proxying
// app.get("/stream", async (req, res) => {
//     const streamUrl = req.query.url;
    

//     if (!streamUrl) {
//         return res.status(400).send("M3U8 URL is required");
//     }

//     try {
//         console.log(`Proxying stream from: ${streamUrl}`);

//         // Fetch M3U8 file without sending referer/origin
//         const m3u8Response = await request(streamUrl, {
//             headers: {
//                 "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
//                 "Accept": "*/*"
//             }
//         });

//         if (m3u8Response.statusCode !== 200) {
//             return res.status(m3u8Response.statusCode).send(`Error fetching M3U8: ${m3u8Response.statusCode}`);
//         }

//         // Read the response body as text
//         const m3u8Data = await m3u8Response.body.text();

//         // Base URL for resolving relative URLs
//         const baseUrl = streamUrl.substring(0, streamUrl.lastIndexOf('/') + 1);

//         // Process the M3U8 content line by line
//         const lines = m3u8Data.split('\n');
//         const modifiedLines = [];

//         for (let i = 0; i < lines.length; i++) {
//             let line = lines[i].trim();

//             // Handle EXT-X-KEY for encryption
//             if (line.startsWith('#EXT-X-KEY')) {
//                 const keyPattern = /URI="([^"]+)"/;
//                 const keyMatch = line.match(keyPattern);

//                 if (keyMatch && keyMatch[1]) {
//                     const keyUrl = keyMatch[1].startsWith('https')
//                         ? keyMatch[1]
//                         : new URL(keyMatch[1], baseUrl).href;

//                     line = line.replace(keyPattern, `URI="/key?url=${encodeURIComponent(keyUrl)}"`);
//                 }
//                 modifiedLines.push(line);
//             }
//             // Handle nested playlists (.m3u8 files)
//             else if (!line.startsWith('#') && line.endsWith('.m3u8')) {
//                 const playlistUrl = line.startsWith('https') ? line : new URL(line, baseUrl).href;
//                 modifiedLines.push(`/stream?url=${encodeURIComponent(playlistUrl)}`);
//             }
//             // Handle segment URLs (not starting with # and not empty)
//             else if (!line.startsWith('#') && line.length > 0) {
//                 // This is likely a segment URL
//                 const segmentUrl = line.startsWith('https') ? line : new URL(line, baseUrl).href;
//                 modifiedLines.push(`/segment?url=${encodeURIComponent(segmentUrl)}`);
//             }
//             else {
//                 // Pass through all other lines unchanged (comments, headers, etc.)
//                 modifiedLines.push(line);
//             }
//         }

//         // Return the modified M3U8 content
//         res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
//         res.send(modifiedLines.join('\n'));

//     } catch (err) {
//         console.error("Proxy error:", err.message);
//         res.status(500).send(`Failed to fetch the stream: ${err.message}`);
//     }
// });

// with 403 restriciton for other doms
app.get("/stream", async (req, res) => {
    // DOMAIN PROTECTION: Check if the request is coming from allowed domains
    const referer = req.headers.referer || '';
    const host = req.headers.host || '';
    const origin = req.headers.origin || '';
    
    // Only allow sphub.tech and development servers
    const productionDomain = 'sphub.tech';
    
    // For detailed debugging - log all headers
    console.log('REQUEST HEADERS:', JSON.stringify(req.headers, null, 2));
    
    // Extract the actual host that's making the request
    // This is the server where the stream endpoint is running
    const currentHost = host.split(':')[0]; // Remove port if present
    
    // Check if we're running on a development server
    const isDevelopmentServer = 
        currentHost === 'localhost' || 
        currentHost === '127.0.0.1';
    
    // Check if the request is specifically from sphub.tech
    // Only check referer and origin for this
    const isFromSphubTech = 
        (referer && referer.includes(productionDomain)) || 
        (origin && origin.includes(productionDomain));
    
    // CRITICAL CHECK: If we're on a development server, we need to validate
    // that external requests are only coming from sphub.tech
    let isAllowed = false;
    
    if (isDevelopmentServer) {
        // On dev server, only allow:
        // 1. Direct access from localhost (no external origin)
        // 2. Requests from sphub.tech
        isAllowed = !origin || origin.includes('localhost') || origin.includes('127.0.0.1') || isFromSphubTech;
    } else {
        // On production, the server should be running on sphub.tech domain
        isAllowed = host || currentHost === productionDomain || isFromSphubTech;
    }
    
    console.log('Access check:', {
        referer,
        host,
        origin,
        currentHost,
        isDevelopmentServer,
        isFromSphubTech,
        isAllowed
    });
    
    // Block requests from any other domain
    if (!isAllowed) {
        console.log('ACCESS DENIED - Not from sphub.tech or local development');
        return res.status(403).send("Access denied. This service is only available on sphub.tech");
    }

    // const productionDomain = 'sphub.tech';
    

    const streamUrl = req.query.url;
    
    if (!streamUrl) {
        return res.status(400).send("M3U8 URL is required");
    }

    try {
        console.log(`Proxying stream from: ${streamUrl}`);

        // Fetch M3U8 file without sending referer/origin
        const m3u8Response = await request(streamUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                "Accept": "*/*"
            }
        });

        if (m3u8Response.statusCode !== 200) {
            return res.status(m3u8Response.statusCode).send(`Error fetching M3U8: ${m3u8Response.statusCode}`);
        }

        // Read the response body as text
        const m3u8Data = await m3u8Response.body.text();

        // Base URL for resolving relative URLs
        const baseUrl = streamUrl.substring(0, streamUrl.lastIndexOf('/') + 1);

        // Process the M3U8 content line by line
        const lines = m3u8Data.split('\n');
        const modifiedLines = [];

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim();

            // Handle EXT-X-KEY for encryption
            if (line.startsWith('#EXT-X-KEY')) {
                const keyPattern = /URI="([^"]+)"/;
                const keyMatch = line.match(keyPattern);

                if (keyMatch && keyMatch[1]) {
                    const keyUrl = keyMatch[1].startsWith('https')
                        ? keyMatch[1]
                        : new URL(keyMatch[1], baseUrl).href;

                    line = line.replace(keyPattern, `URI="/key?url=${encodeURIComponent(keyUrl)}"`);
                }
                modifiedLines.push(line);
            }
            // Handle nested playlists (.m3u8 files)
            else if (!line.startsWith('#') && line.endsWith('.m3u8')) {
                const playlistUrl = line.startsWith('https') ? line : new URL(line, baseUrl).href;
                modifiedLines.push(`/stream?url=${encodeURIComponent(playlistUrl)}`);
            }
            // Handle segment URLs (not starting with # and not empty)
            else if (!line.startsWith('#') && line.length > 0) {
                // This is likely a segment URL
                const segmentUrl = line.startsWith('https') ? line : new URL(line, baseUrl).href;
                modifiedLines.push(`/segment?url=${encodeURIComponent(segmentUrl)}`);
            }
            else {
                // Pass through all other lines unchanged (comments, headers, etc.)
                modifiedLines.push(line);
            }
        }

        // Return the modified M3U8 content
        res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
        res.send(modifiedLines.join('\n'));

    } catch (err) {
        console.error("Proxy error:", err.message);
        res.status(500).send(`Failed to fetch the stream: ${err.message}`);
    }
});

// Route to handle segment requests
app.get("/segment", async (req, res) => {
    const segmentUrl = req.query.url;

    if (!segmentUrl) {
        return res.status(400).send("Segment URL is required");
    }

    try {
        console.log(`Fetching segment: ${segmentUrl}`);

        // Fetch segment without referer/origin headers
        const segmentResponse = await request(segmentUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                "Accept": "*/*"
            }
        });

        if (segmentResponse.statusCode !== 200) {
            return res.status(segmentResponse.statusCode).send(`Error fetching segment: ${segmentResponse.statusCode}`);
        }

        // Detect content type based on URL
        if (segmentUrl.toLowerCase().includes('.m4s') || segmentUrl.toLowerCase().includes('.mp4')) {
            res.setHeader('Content-Type', 'video/mp4');
        } else {
            res.setHeader('Content-Type', 'video/MP2T');
        }

        // Stream the segment data directly
        segmentResponse.body.pipe(res);
    } catch (err) {
        console.error("Segment proxy error:", err.message);
        res.status(500).send(`Failed to fetch segment: ${err.message}`);
    }
});

// Route to handle encryption key requests
app.get("/key", async (req, res) => {
    const keyUrl = req.query.url;

    if (!keyUrl) {
        return res.status(400).send("Key URL is required");
    }

    try {
        console.log(`Fetching encryption key: ${keyUrl}`);

        // Fetch key without referer/origin headers
        const keyResponse = await request(keyUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                "Accept": "*/*"
            }
        });

        if (keyResponse.statusCode !== 200) {
            return res.status(keyResponse.statusCode).send(`Error fetching key: ${keyResponse.statusCode}`);
        }

        // Get the key data as a buffer
        const keyData = await keyResponse.body.arrayBuffer();
        const keyBuffer = Buffer.from(keyData);

        // Forward the key content with proper content type
        res.setHeader("Content-Type", "application/octet-stream");
        res.send(keyBuffer);
    } catch (err) {
        console.error("Key proxy error:", err.message);
        res.status(500).send(`Failed to fetch encryption key: ${err.message}`);
    }
});

// Iframe embed page
// app.get("/embed", (req, res) => {
   

//     const streamUrl = req.query.url;
//     if (!streamUrl) {
//         return res.status(400).send("Stream URL is required as a query parameter");
//     }

//     // Get server origin (protocol + host)
//     const serverOrigin = `${req.protocol}://${req.get('host')}`;

//     const embedHtml = `
    
//     <!DOCTYPE html>
//     <html>
//     <head>
//         <title>Stream Player</title>
//         <script src="https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.4.10/hls.min.js"></script>
//         <style>
//             body { margin: 0; padding: 0; background-color: #000; overflow: hidden; }
//             #video { width: 100%; height: 100vh; }
//         </style>
//     </head>
//     <body>
//         <video id="video" controls autoplay></video>
//         <script>
//             document.addEventListener('DOMContentLoaded', function() {
//                 const video = document.getElementById('video');
//                 const proxyUrl = '${serverOrigin}/stream?url=${encodeURIComponent(streamUrl)}';

//                 if (Hls.isSupported()) {
//                     const hls = new Hls({
//                         maxBufferLength: 30,
//                         maxMaxBufferLength: 60
//                     });
//                     hls.loadSource(proxyUrl);
//                     hls.attachMedia(video);
//                     hls.on(Hls.Events.MANIFEST_PARSED, function() {
//                         video.play();
//                     });

//                     hls.on(Hls.Events.ERROR, function(event, data) {
//                         console.error('HLS error:', data);
//                         if (data.fatal) {
//                             switch(data.type) {
//                                 case Hls.ErrorTypes.NETWORK_ERROR:
//                                     console.log('Fatal network error, trying to recover...');
//                                     hls.startLoad();
//                                     break;
//                                 case Hls.ErrorTypes.MEDIA_ERROR:
//                                     console.log('Fatal media error, trying to recover...');
//                                     hls.recoverMediaError();
//                                     break;
//                                 default:
//                                     console.log('Fatal error, cannot recover');
//                                     hls.destroy();
//                                     break;
//                             }
//                         }
//                     });
//                 } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
//                     // For Safari
//                     video.src = proxyUrl;
//                     video.addEventListener('canplay', function() {
//                         video.play();
//                     });
//                 } else {
//                     console.error('HLS is not supported in this browser');
//                 }
//             });
//         </script>
//     </body>
//     </html>
//     `;

//     res.send(embedHtml);
// });

// works well but not redirect
app.get("/embed", (req, res) => {
    const streamUrl = req.query.url;
    if (!streamUrl) {
        return res.status(400).send("Stream URL is required as a query parameter");
    }

    const host = req.headers.host || '';
    const trustedDomain = 'sphub.tech';
    const productionUrl = `https://${trustedDomain}`;

    const isTrustedHost = host || host.includes(trustedDomain) || host.includes('localhost') || host.includes('127.0.0.1');

    if (!isTrustedHost) {
        console.warn('Embed access denied. Host is not trusted:', host);
        return res.redirect(productionUrl);
    }

    // Prevent iframe embedding from other domains
    res.setHeader("Content-Security-Policy", "frame-ancestors 'self' https://sphub.tech");

    const serverOrigin = `${req.protocol}://${req.get('host')}`;

    const embedHtml = `
    <!DOCTYPE html>
    <html>
    <head>      
        <title>SPHub Stream Player</title>         
        <script src="https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.4.10/hls.min.js"></script>         
        <style>             
            body { margin: 0; padding: 0; background-color: #000; overflow: hidden; }             
            #video { width: 100%; height: 100vh; }         
        </style>     
    </head>     
    <body>         
        <video id="video" controls autoplay></video>         
        <script>             
            document.addEventListener('DOMContentLoaded', function() {                 
                const video = document.getElementById('video');                 
                const proxyUrl = '${serverOrigin}/stream?url=${encodeURIComponent(streamUrl)}';                  
                
                if (Hls.isSupported()) {                     
                    const hls = new Hls({                         
                        maxBufferLength: 30,                         
                        maxMaxBufferLength: 60                     
                    });                     
                    hls.loadSource(proxyUrl);                     
                    hls.attachMedia(video);                     
                    hls.on(Hls.Events.MANIFEST_PARSED, function() {                         
                        video.play();                     
                    });                      
                    
                    hls.on(Hls.Events.ERROR, function(event, data) {                         
                        console.error('HLS error:', data);                         
                        if (data.fatal) {                             
                            switch(data.type) {                                 
                                case Hls.ErrorTypes.NETWORK_ERROR:                                     
                                    hls.startLoad();                                     
                                    break;                                 
                                case Hls.ErrorTypes.MEDIA_ERROR:                                     
                                    hls.recoverMediaError();                                     
                                    break;                                 
                                default:                                     
                                    hls.destroy();                                     
                                    break;                             
                            }                         
                        }                     
                    });                 
                } else if (video.canPlayType('application/vnd.apple.mpegurl')) {                     
                    video.src = proxyUrl;                     
                    video.addEventListener('canplay', function() {                         
                        video.play();                     
                    });                 
                } else {                     
                    console.error('HLS is not supported in this browser');                 
                }             
            });         
        </script>     
    </body>     
    </html>`;

    res.send(embedHtml);
});



// Simple HTML player
app.get("/player", (req, res) => {
    const streamUrl = req.query.url;
    if (!streamUrl) {
        return res.status(400).send("Stream URL is required as a query parameter");
    }

    // Get server origin (protocol + host)
    const serverOrigin = `${req.protocol}://${req.get('host')}`;

    const playerHtml = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>HLS Stream Player</title>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.4.10/hls.min.js"></script>
        <style>
            body { margin: 0; background-color: #000; font-family: Arial, sans-serif; color: white; }
            .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
            #video { width: 100%; max-height: 70vh; }
            h1 { color: white; }
            .controls { margin-top: 20px; }
            button { background-color: #4CAF50; color: white; border: none; padding: 10px 15px; cursor: pointer; margin-right: 10px; }
            button:hover { background-color: #45a049; }
            .embed-code { margin-top: 20px; background-color: #333; padding: 15px; border-radius: 5px; }
            textarea { width: 100%; height: 120px; background-color: #222; color: white; border: 1px solid #444; padding: 10px; margin-top: 10px; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>HLS Stream Player</h1>
            <video id="video" controls></video>

            <div class="controls">
                <button onclick="toggleEmbedCode()">Show Embed Code</button>
                <button onclick="copyEmbedCode()">Copy Embed Code</button>
                <button onclick="window.open('${serverOrigin}/embed?url=${encodeURIComponent(streamUrl)}', '_blank')">Open Embed View</button>
            </div>

            <div id="embed-code-container" class="embed-code" style="display: none;">
                <h3>Embed Code</h3>
                <p>Copy and paste this code to embed the player in your website:</p>
                <textarea id="embed-code" readonly><iframe src="${serverOrigin}/embed?url=${encodeURIComponent(streamUrl)}" width="640" height="360" frameborder="0" allowfullscreen></iframe></textarea>

                <h3>Direct Links</h3>
                <p>Stream URL (for players that support HLS):</p>
                <textarea readonly>${serverOrigin}/stream?url=${encodeURIComponent(streamUrl)}</textarea>
            </div>
        </div>

        <script>
            document.addEventListener('DOMContentLoaded', function() {
                const video = document.getElementById('video');
                const proxyUrl = '${serverOrigin}/stream?url=${encodeURIComponent(streamUrl)}';

                if (Hls.isSupported()) {
                    const hls = new Hls({
                        maxBufferLength: 30,
                        maxMaxBufferLength: 60
                    });
                    hls.loadSource(proxyUrl);
                    hls.attachMedia(video);
                    hls.on(Hls.Events.MANIFEST_PARSED, function() {
                        video.play();
                    });

                    hls.on(Hls.Events.ERROR, function(event, data) {
                        console.error('HLS error:', data);
                        if (data.fatal) {
                            switch(data.type) {
                                case Hls.ErrorTypes.NETWORK_ERROR:
                                    console.log('Fatal network error, trying to recover...');
                                    hls.startLoad();
                                    break;
                                case Hls.ErrorTypes.MEDIA_ERROR:
                                    console.log('Fatal media error, trying to recover...');
                                    hls.recoverMediaError();
                                    break;
                                default:
                                    console.log('Fatal error, cannot recover');
                                    hls.destroy();
                                    break;
                            }
                        }
                    });
                } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                    // For Safari
                    video.src = proxyUrl;
                    video.addEventListener('canplay', function() {
                        video.play();
                    });
                } else {
                    console.error('HLS is not supported in this browser');
                }
            });

            function toggleEmbedCode() {
                const container = document.getElementById('embed-code-container');
                container.style.display = container.style.display === 'none' ? 'block' : 'none';
            }

            function copyEmbedCode() {
                const embedCode = document.getElementById('embed-code');
                embedCode.select();
                document.execCommand('copy');
                alert('Embed code copied to clipboard!');
            }
        </script>
    </body>
    </html>
    `;

    res.send(playerHtml);
});

// Set up server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Proxy server running on https://localhost:${PORT}`));


// with allowed dom

// with api
// const express = require("express");
// const cors = require("cors");
// const { request } = require("undici");

// const app = express();
// app.use(cors());
// app.use(express.json()); // Add JSON body parser for API requests with JSON payloads

// // Trust the proxy to get accurate protocol info
// app.set('trust proxy', true);

// // Define allowed domains
// // const ALLOWED_DOMAINS = ["sphub.tech", "localhost"];

// // // Domain checker middleware
// // app.use((req, res, next) => {
// //     const host = req.hostname;

// //     // Check if the domain is allowed
// //     if (ALLOWED_DOMAINS.includes(host)) {
// //         next(); // Continue to the next middleware or route handler
// //     } else {
// //         // Redirect to sphub.tech with the same protocol
// //         const protocol = req.protocol;
// //         const redirectUrl = `${protocol}://sphub.tech${req.originalUrl}`;
// //         console.log(`Redirecting non-allowed domain ${host} to ${redirectUrl}`);
// //         return res.redirect(redirectUrl);
// //     }
// // });

// // New route to handle general API proxying
// app.all("/api-proxy", async (req, res) => {
//     const targetUrl = req.query.url;

//     if (!targetUrl) {
//         return res.status(400).json({ error: "Target URL is required as a query parameter" });
//     }

//     try {
//         console.log(`Proxying API request to: ${targetUrl}`);
//         console.log(`Method: ${req.method}`);

//         // Forward headers but exclude some that might cause issues
//         const headers = { ...req.headers };
//         delete headers.host;
//         delete headers.connection;

//         // Add common headers for API requests
//         headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

//         const requestOptions = {
//             method: req.method,
//             headers: headers,
//             body: ["GET", "HEAD"].includes(req.method) ? undefined : JSON.stringify(req.body)
//         };

//         // Forward the request to the target API
//         const apiResponse = await request(targetUrl, requestOptions);

//         // Copy response headers
//         const responseHeaders = apiResponse.headers;
//         for (const [key, value] of Object.entries(responseHeaders)) {
//             // Skip headers that might cause issues
//             if (!["connection", "transfer-encoding"].includes(key.toLowerCase())) {
//                 res.setHeader(key, value);
//             }
//         }

//         // Set status code
//         res.status(apiResponse.statusCode);

//         // Determine response format and send accordingly
//         const contentType = responseHeaders["content-type"] || "";

//         if (contentType.includes("application/json")) {
//             const jsonData = await apiResponse.body.json();
//             res.json(jsonData);
//         } else if (contentType.includes("text/")) {
//             const textData = await apiResponse.body.text();
//             res.send(textData);
//         } else {
//             // For binary data or other formats
//             const buffer = await apiResponse.body.arrayBuffer();
//             res.send(Buffer.from(buffer));
//         }
//     } catch (err) {
//         console.error("API proxy error:", err.message);
//         res.status(500).json({ error: `Failed to proxy API request: ${err.message}` });
//     }
// });

// // Add documentation to the homepage
// app.get("/", (req, res) => {
//     // Get server origin (protocol + host)
//     const serverOrigin = `${req.protocol}://${req.get('host')}`;

//     const html = `
//     <!DOCTYPE html>
//     <html>
//     <head>
//         <title>M3U8 Stream & API Proxy</title>
//         <style>
//             body {
//                 font-family: Arial, sans-serif;
//                 max-width: 800px;
//                 margin: 0 auto;
//                 padding: 20px;
//                 line-height: 1.6;
//             }
//             .form-group {
//                 margin-bottom: 15px;
//             }
//             label {
//                 display: block;
//                 margin-bottom: 5px;
//                 font-weight: bold;
//             }
//             input[type="text"] {
//                 width: 100%;
//                 padding: 8px;
//                 box-sizing: border-box;
//                 border: 1px solid #ddd;
//                 border-radius: 4px;
//             }
//             button {
//                 padding: 10px 15px;
//                 background-color: #4CAF50;
//                 color: white;
//                 border: none;
//                 cursor: pointer;
//                 border-radius: 4px;
//                 margin-right: 5px;
//                 font-size: 14px;
//             }
//             button:hover {
//                 background-color: #45a049;
//             }
//             .button-group {
//                 margin-top: 10px;
//             }
//             h1, h2 {
//                 color: #333;
//             }
//             .section {
//                 margin-top: 30px;
//                 padding: 15px;
//                 background-color: #f5f5f5;
//                 border-radius: 5px;
//             }
//             code {
//                 background-color: #eee;
//                 padding: 2px 4px;
//                 border-radius: 3px;
//                 font-family: monospace;
//             }
//             textarea {
//                 width: 100%;
//                 height: 80px;
//                 padding: 8px;
//                 box-sizing: border-box;
//                 border: 1px solid #ddd;
//                 border-radius: 4px;
//                 font-family: monospace;
//             }
//             .tabs {
//                 display: flex;
//                 margin-bottom: 15px;
//             }
//             .tab {
//                 padding: 10px 15px;
//                 background-color: #eee;
//                 cursor: pointer;
//                 border-radius: 4px 4px 0 0;
//                 margin-right: 5px;
//             }
//             .tab.active {
//                 background-color: #4CAF50;
//                 color: white;
//             }
//             .tab-content {
//                 display: none;
//                 padding: 15px;
//                 background-color: #f5f5f5;
//                 border-radius: 0 4px 4px 4px;
//             }
//             .tab-content.active {
//                 display: block;
//             }
//             .domain-notice {
//                 background-color: #fff3cd;
//                 color: #856404;
//                 padding: 10px;
//                 border-radius: 4px;
//                 margin-bottom: 20px;
//                 border: 1px solid #ffeeba;
//             }
//         </style>
//     </head>
//     <body>
//         <h1>Stream & API Proxy</h1>
        
//         <div class="domain-notice">
//             <strong>Note:</strong> This service is only accessible through <strong>sphub.tech</strong>. All other domains will be redirected.
//         </div>
        
//         <div class="tabs">
//             <div class="tab active" onclick="switchTab('stream-tab', this)">HLS Stream Proxy</div>
//             <div class="tab" onclick="switchTab('api-tab', this)">API Proxy</div>
//         </div>
        
//         <div id="stream-tab" class="tab-content active">
//             <p>Enter an M3U8 URL to proxy, play, and embed:</p>
            
//             <div class="form-group">
//                 <label for="m3u8-url">M3U8 URL:</label>
//                 <input type="text" id="m3u8-url" placeholder="https://example.com/stream.m3u8">
//             </div>
            
//             <div class="button-group">
//                 <button onclick="playStream()">Play Stream</button>
//                 <button onclick="getEmbedCode()">Get Embed Code</button>
//                 <button onclick="openEmbedPlayer()">Open Embed Player</button>
//             </div>
            
//             <div id="stream-result" style="display:none; margin-top:20px;">
//                 <h2>Embed Code</h2>
//                 <p>Copy and paste this code to embed the player in your website:</p>
//                 <textarea id="embed-code-result" readonly></textarea>
                
//                 <h2>Direct Stream URL</h2>
//                 <p>Use this URL in media players that support HLS:</p>
//                 <textarea id="direct-link-result" readonly></textarea>
//             </div>
//         </div>
        
//         <div id="api-tab" class="tab-content">
//             <p>Enter an API URL to proxy:</p>
            
//             <div class="form-group">
//                 <label for="api-url">API URL:</label>
//                 <input type="text" id="api-url" placeholder="https://api.example.com/endpoint">
//             </div>
            
//             <div class="form-group">
//                 <label for="api-method">https Method:</label>
//                 <select id="api-method">
//                     <option value="GET">GET</option>
//                     <option value="POST">POST</option>
//                     <option value="PUT">PUT</option>
//                     <option value="DELETE">DELETE</option>
//                     <option value="PATCH">PATCH</option>
//                 </select>
//             </div>
            
//             <div class="form-group">
//                 <label for="api-body">Request Body (JSON):</label>
//                 <textarea id="api-body" placeholder='{"key": "value"}'></textarea>
//             </div>
            
//             <div class="button-group">
//                 <button onclick="testApiProxy()">Test API Request</button>
//                 <button onclick="getApiProxyUrl()">Get API Proxy URL</button>
//             </div>
            
//             <div id="api-result" style="display:none; margin-top:20px;">
//                 <h2>Proxy URL</h2>
//                 <p>Use this URL to proxy API requests:</p>
//                 <textarea id="api-proxy-url" readonly></textarea>
                
//                 <h2>Response</h2>
//                 <pre id="api-response" style="background-color: #eee; padding: 10px; border-radius: 4px; overflow: auto; max-height: 300px;"></pre>
//             </div>
//         </div>
        
//         <div class="section">
//             <h2>API Proxy Usage</h2>
//             <p>To use the API proxy in your code:</p>
//             <pre><code>// Example using fetch
// fetch('${serverOrigin}/api-proxy?url=' + encodeURIComponent('https://api.example.com/endpoint'), {
//     method: 'POST', // or GET, PUT, DELETE, etc.
//     headers: {
//         'Content-Type': 'application/json'
//     },
//     body: JSON.stringify({ key: 'value' }) // For POST/PUT/PATCH requests
// })
// .then(response => response.json())
// .then(data => console.log(data))
// .catch(error => console.error('Error:', error));</code></pre>
//         </div>
        
//         <script>
//             function switchTab(tabId, clickedTab) {
//                 // Hide all tabs
//                 document.querySelectorAll('.tab-content').forEach(tab => {
//                     tab.classList.remove('active');
//                 });
                
//                 // Remove active class from all tab buttons
//                 document.querySelectorAll('.tab').forEach(tab => {
//                     tab.classList.remove('active');
//                 });
                
//                 // Show selected tab
//                 document.getElementById(tabId).classList.add('active');
                
//                 // Add active class to clicked tab button
//                 clickedTab.classList.add('active');
//             }
        
//             function playStream() {
//                 const url = document.getElementById('m3u8-url').value.trim();
//                 if (!url) {
//                     alert('Please enter a valid M3U8 URL');
//                     return;
//                 }
                
//                 window.location.href = '/player?url=' + encodeURIComponent(url);
//             }
            
//             function getEmbedCode() {
//                 const url = document.getElementById('m3u8-url').value.trim();
//                 if (!url) {
//                     alert('Please enter a valid M3U8 URL');
//                     return;
//                 }
                
//                 const proxyUrl = '/stream?url=' + encodeURIComponent(url);
//                 const embedUrl = '/embed?url=' + encodeURIComponent(url);
                
//                 document.getElementById('embed-code-result').value = '<iframe src="${serverOrigin}' + embedUrl + '" width="640" height="360" frameborder="0" allowfullscreen></iframe>';
//                 document.getElementById('direct-link-result').value = '${serverOrigin}' + proxyUrl;
                
//                 document.getElementById('stream-result').style.display = 'block';
//             }
            
//             function openEmbedPlayer() {
//                 const url = document.getElementById('m3u8-url').value.trim();
//                 if (!url) {
//                     alert('Please enter a valid M3U8 URL');
//                     return;
//                 }
                
//                 window.open('/embed?url=' + encodeURIComponent(url), '_blank');
//             }
            
//             function testApiProxy() {
//                 const url = document.getElementById('api-url').value.trim();
//                 if (!url) {
//                     alert('Please enter a valid API URL');
//                     return;
//                 }
                
//                 const method = document.getElementById('api-method').value;
//                 const bodyText = document.getElementById('api-body').value.trim();
//                 let body = undefined;
                
//                 if (bodyText && ['POST', 'PUT', 'PATCH'].includes(method)) {
//                     try {
//                         body = JSON.parse(bodyText);
//                     } catch (e) {
//                         alert('Invalid JSON in request body');
//                         return;
//                     }
//                 }
                
//                 const proxyUrl = '/api-proxy?url=' + encodeURIComponent(url);
                
//                 fetch(proxyUrl, {
//                     method: method,
//                     headers: {
//                         'Content-Type': 'application/json'
//                     },
//                     body: body ? JSON.stringify(body) : undefined
//                 })
//                 .then(response => {
//                     if (!response.ok) {
//                         throw new Error('API request failed with status ' + response.status);
//                     }
//                     return response.text();
//                 })
//                 .then(data => {
//                     try {
//                         // Try to parse as JSON
//                         const jsonData = JSON.parse(data);
//                         document.getElementById('api-response').textContent = JSON.stringify(jsonData, null, 2);
//                     } catch (e) {
//                         // Not JSON, show as text
//                         document.getElementById('api-response').textContent = data;
//                     }
                    
//                     document.getElementById('api-proxy-url').value = '${serverOrigin}' + proxyUrl;
//                     document.getElementById('api-result').style.display = 'block';
//                 })
//                 .catch(error => {
//                     document.getElementById('api-response').textContent = 'Error: ' + error.message;
//                     document.getElementById('api-proxy-url').value = '${serverOrigin}' + proxyUrl;
//                     document.getElementById('api-result').style.display = 'block';
//                 });
//             }
            
//             function getApiProxyUrl() {
//                 const url = document.getElementById('api-url').value.trim();
//                 if (!url) {
//                     alert('Please enter a valid API URL');
//                     return;
//                 }
                
//                 const proxyUrl = '/api-proxy?url=' + encodeURIComponent(url);
//                 document.getElementById('api-proxy-url').value = '${serverOrigin}' + proxyUrl;
//                 document.getElementById('api-result').style.display = 'block';
//             }
//         </script>
//     </body>
//     </html>
//     `;

//     res.send(html);
// });

// // Route to handle M3U8 manifest proxying
// app.get("/stream", async (req, res) => {
//     const referer = req.get('referer') || '';
//     const origin = req.get('origin') || '';

//     if (!referer.includes('sphub.tech') && !origin.includes('sphub.tech')) {
//         return res.redirect('https://sphub.tech');
//     }

//     next();

//     const streamUrl = req.query.url;


//     if (!streamUrl) {
//         return res.status(400).send("M3U8 URL is required");
//     }

//     try {
//         console.log(`Proxying stream from: ${streamUrl}`);

//         // Fetch M3U8 file without sending referer/origin
//         const m3u8Response = await request(streamUrl, {
//             headers: {
//                 "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
//                 "Accept": "*/*"
//             }
//         });

//         if (m3u8Response.statusCode !== 200) {
//             return res.status(m3u8Response.statusCode).send(`Error fetching M3U8: ${m3u8Response.statusCode}`);
//         }

//         // Read the response body as text
//         const m3u8Data = await m3u8Response.body.text();

//         // Base URL for resolving relative URLs
//         const baseUrl = streamUrl.substring(0, streamUrl.lastIndexOf('/') + 1);

//         // Process the M3U8 content line by line
//         const lines = m3u8Data.split('\n');
//         const modifiedLines = [];

//         for (let i = 0; i < lines.length; i++) {
//             let line = lines[i].trim();

//             // Handle EXT-X-KEY for encryption
//             if (line.startsWith('#EXT-X-KEY')) {
//                 const keyPattern = /URI="([^"]+)"/;
//                 const keyMatch = line.match(keyPattern);

//                 if (keyMatch && keyMatch[1]) {
//                     const keyUrl = keyMatch[1].startsWith('https')
//                         ? keyMatch[1]
//                         : new URL(keyMatch[1], baseUrl).href;

//                     line = line.replace(keyPattern, `URI="/key?url=${encodeURIComponent(keyUrl)}"`);
//                 }
//                 modifiedLines.push(line);
//             }
//             // Handle nested playlists (.m3u8 files)
//             else if (!line.startsWith('#') && line.endsWith('.m3u8')) {
//                 const playlistUrl = line.startsWith('https') ? line : new URL(line, baseUrl).href;
//                 modifiedLines.push(`/stream?url=${encodeURIComponent(playlistUrl)}`);
//             }
//             // Handle segment URLs (not starting with # and not empty)
//             else if (!line.startsWith('#') && line.length > 0) {
//                 // This is likely a segment URL
//                 const segmentUrl = line.startsWith('https') ? line : new URL(line, baseUrl).href;
//                 modifiedLines.push(`/segment?url=${encodeURIComponent(segmentUrl)}`);
//             }
//             else {
//                 // Pass through all other lines unchanged (comments, headers, etc.)
//                 modifiedLines.push(line);
//             }
//         }

//         // Return the modified M3U8 content
//         res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
//         res.send(modifiedLines.join('\n'));

//     } catch (err) {
//         console.error("Proxy error:", err.message);
//         res.status(500).send(`Failed to fetch the stream: ${err.message}`);
//     }
// });

// // Route to handle segment requests
// app.get("/segment", async (req, res) => {
//     const segmentUrl = req.query.url;

//     if (!segmentUrl) {
//         return res.status(400).send("Segment URL is required");
//     }

//     try {
//         console.log(`Fetching segment: ${segmentUrl}`);

//         // Fetch segment without referer/origin headers
//         const segmentResponse = await request(segmentUrl, {
//             headers: {
//                 "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
//                 "Accept": "*/*"
//             }
//         });

//         if (segmentResponse.statusCode !== 200) {
//             return res.status(segmentResponse.statusCode).send(`Error fetching segment: ${segmentResponse.statusCode}`);
//         }

//         // Detect content type based on URL
//         if (segmentUrl.toLowerCase().includes('.m4s') || segmentUrl.toLowerCase().includes('.mp4')) {
//             res.setHeader('Content-Type', 'video/mp4');
//         } else {
//             res.setHeader('Content-Type', 'video/MP2T');
//         }

//         // Stream the segment data directly
//         segmentResponse.body.pipe(res);
//     } catch (err) {
//         console.error("Segment proxy error:", err.message);
//         res.status(500).send(`Failed to fetch segment: ${err.message}`);
//     }
// });

// // Route to handle encryption key requests
// app.get("/key", async (req, res) => {
//     const keyUrl = req.query.url;

//     if (!keyUrl) {
//         return res.status(400).send("Key URL is required");
//     }

//     try {
//         console.log(`Fetching encryption key: ${keyUrl}`);

//         // Fetch key without referer/origin headers
//         const keyResponse = await request(keyUrl, {
//             headers: {
//                 "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
//                 "Accept": "*/*"
//             }
//         });

//         if (keyResponse.statusCode !== 200) {
//             return res.status(keyResponse.statusCode).send(`Error fetching key: ${keyResponse.statusCode}`);
//         }

//         // Get the key data as a buffer
//         const keyData = await keyResponse.body.arrayBuffer();
//         const keyBuffer = Buffer.from(keyData);

//         // Forward the key content with proper content type
//         res.setHeader("Content-Type", "application/octet-stream");
//         res.send(keyBuffer);
//     } catch (err) {
//         console.error("Key proxy error:", err.message);
//         res.status(500).send(`Failed to fetch encryption key: ${err.message}`);
//     }
// });

// // Iframe embed page
// app.get("/embed", (req, res) => {

//     if (window !== window.top) {
//         // It is embedded
//         if (document.referrer && !document.referrer.includes('sphub.tech')) {
//             window.top.location = 'https://sphub.tech';
//         }
//     } else {
//         // Not embedded (direct access)
//         window.location.href = 'https://sphub.tech';
//     }

//     const streamUrl = req.query.url;
//     if (!streamUrl) {
//         return res.status(400).send("Stream URL is required as a query parameter");
//     }

//     // Get server origin (protocol + host)
//     const serverOrigin = `${req.protocol}://${req.get('host')}`;

//     const embedHtml = `
//     <!DOCTYPE html>
//     <html>
//     <head>
//         <title>Stream Player</title>
//         <script src="https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.4.10/hls.min.js"></script>
//         <style>
//             body { margin: 0; padding: 0; background-color: #000; overflow: hidden; }
//             #video { width: 100%; height: 100vh; }
//         </style>
//     </head>
//     <body>
//         <video id="video" controls autoplay></video>
//         <script>
//             document.addEventListener('DOMContentLoaded', function() {
//                 const video = document.getElementById('video');
//                 const proxyUrl = '${serverOrigin}/stream?url=${encodeURIComponent(streamUrl)}';
                
//                 if (Hls.isSupported()) {
//                     const hls = new Hls({
//                         maxBufferLength: 30,
//                         maxMaxBufferLength: 60
//                     });
//                     hls.loadSource(proxyUrl);
//                     hls.attachMedia(video);
//                     hls.on(Hls.Events.MANIFEST_PARSED, function() {
//                         video.play();
//                     });
                    
//                     hls.on(Hls.Events.ERROR, function(event, data) {
//                         console.error('HLS error:', data);
//                         if (data.fatal) {
//                             switch(data.type) {
//                                 case Hls.ErrorTypes.NETWORK_ERROR:
//                                     console.log('Fatal network error, trying to recover...');
//                                     hls.startLoad();
//                                     break;
//                                 case Hls.ErrorTypes.MEDIA_ERROR:
//                                     console.log('Fatal media error, trying to recover...');
//                                     hls.recoverMediaError();
//                                     break;
//                                 default:
//                                     console.log('Fatal error, cannot recover');
//                                     hls.destroy();
//                                     break;
//                             }
//                         }
//                     });
//                 } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
//                     // For Safari
//                     video.src = proxyUrl;
//                     video.addEventListener('canplay', function() {
//                         video.play();
//                     });
//                 } else {
//                     console.error('HLS is not supported in this browser');
//                 }
//             });
//         </script>
//     </body>
//     </html>
//     `;

//     res.send(embedHtml);
// });

// // Simple HTML player
// app.get("/player", (req, res) => {
//     const streamUrl = req.query.url;
//     if (!streamUrl) {
//         return res.status(400).send("Stream URL is required as a query parameter");
//     }

//     // Get server origin (protocol + host)
//     const serverOrigin = `${req.protocol}://${req.get('host')}`;

//     const playerHtml = `
//     <!DOCTYPE html>
//     <html>
//     <head>
//         <title>HLS Stream Player</title>
//         <script src="https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.4.10/hls.min.js"></script>
//         <style>
//             body { margin: 0; background-color: #000; font-family: Arial, sans-serif; color: white; }
//             .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
//             #video { width: 100%; max-height: 70vh; }
//             h1 { color: white; }
//             .controls { margin-top: 20px; }
//             button { background-color: #4CAF50; color: white; border: none; padding: 10px 15px; cursor: pointer; margin-right: 10px; }
//             button:hover { background-color: #45a049; }
//             .embed-code { margin-top: 20px; background-color: #333; padding: 15px; border-radius: 5px; }
//             textarea { width: 100%; height: 120px; background-color: #222; color: white; border: 1px solid #444; padding: 10px; margin-top: 10px; }
//             .domain-notice {
//                 background-color: #fff3cd;
//                 color: #856404;
//                 padding: 10px;
//                 border-radius: 4px;
//                 margin-bottom: 20px;
//                 border: 1px solid #ffeeba;
//             }
//         </style>
//     </head>
//     <body>
//         <div class="container">
//             <div class="domain-notice">
//                 <strong>Note:</strong> This service is only accessible through <strong>sphub.tech</strong>. All other domains will be redirected.
//             </div>
            
//             <h1>HLS Stream Player</h1>
//             <video id="video" controls></video>
            
//             <div class="controls">
//                 <button onclick="toggleEmbedCode()">Show Embed Code</button>
//                 <button onclick="copyEmbedCode()">Copy Embed Code</button>
//                 <button onclick="window.open('${serverOrigin}/embed?url=${encodeURIComponent(streamUrl)}', '_blank')">Open Embed View</button>
//             </div>
            
//             <div id="embed-code-container" class="embed-code" style="display: none;">
//                 <h3>Embed Code</h3>
//                 <p>Copy and paste this code to embed the player in your website:</p>
//                 <textarea id="embed-code" readonly><iframe src="${serverOrigin}/embed?url=${encodeURIComponent(streamUrl)}" width="640" height="360" frameborder="0" allowfullscreen></iframe></textarea>
                
//                 <h3>Direct Links</h3>
//                 <p>Stream URL (for players that support HLS):</p>
//                 <textarea readonly>${serverOrigin}/stream?url=${encodeURIComponent(streamUrl)}</textarea>
//             </div>
//         </div>
        
//         <script>
//             document.addEventListener('DOMContentLoaded', function() {
//                 const video = document.getElementById('video');
//                 const proxyUrl = '${serverOrigin}/stream?url=${encodeURIComponent(streamUrl)}';
                
//                 if (Hls.isSupported()) {
//                     const hls = new Hls({
//                         maxBufferLength: 30,
//                         maxMaxBufferLength: 60
//                     });
//                     hls.loadSource(proxyUrl);
//                     hls.attachMedia(video);
//                     hls.on(Hls.Events.MANIFEST_PARSED, function() {
//                         video.play();
//                     });
                    
//                     hls.on(Hls.Events.ERROR, function(event, data) {
//                         console.error('HLS error:', data);
//                         if (data.fatal) {
//                             switch(data.type) {
//                                 case Hls.ErrorTypes.NETWORK_ERROR:
//                                     console.log('Fatal network error, trying to recover...');
//                                     hls.startLoad();
//                                     break;
//                                 case Hls.ErrorTypes.MEDIA_ERROR:
//                                     console.log('Fatal media error, trying to recover...');
//                                     hls.recoverMediaError();
//                                     break;
//                                 default:
//                                     console.log('Fatal error, cannot recover');
//                                     hls.destroy();
//                                     break;
//                             }
//                         }
//                     });
//                 } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
//                     // For Safari
//                     video.src = proxyUrl;
//                     video.addEventListener('canplay', function() {
//                         video.play();
//                     });
//                 } else {
//                     console.error('HLS is not supported in this browser');
//                 }
//             });
            
//             function toggleEmbedCode() {
//                 const container = document.getElementById('embed-code-container');
//                 container.style.display = container.style.display === 'none' ? 'block' : 'none';
//             }
            
//             function copyEmbedCode() {
//                 const embedCode = document.getElementById('embed-code');
//                 embedCode.select();
//                 document.execCommand('copy');
//                 alert('Embed code copied to clipboard!');
//             }
//         </script>
//     </body>
//     </html>
//     `;

//     res.send(playerHtml);
// });

// // Set up server
// const PORT = process.env.PORT || 5000;
// app.listen(PORT, () => {
//     console.log(`✅ Proxy server running on https://localhost:${PORT}`);
//     console.log(`✅ Access restricted to domain: sphub.tech`);
// });

// // claude ai 3

