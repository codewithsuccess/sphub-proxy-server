const express = require("express");
const cors = require("cors");
const { request } = require("undici");

const app = express();
app.use(cors());

// Route to handle M3U8 manifest proxying
app.get("/stream", async (req, res) => {
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
                    const keyUrl = keyMatch[1].startsWith('http')
                        ? keyMatch[1]
                        : new URL(keyMatch[1], baseUrl).href;

                    line = line.replace(keyPattern, `URI="/key?url=${encodeURIComponent(keyUrl)}"`);
                }
                modifiedLines.push(line);
            }
            // Handle nested playlists (.m3u8 files)
            else if (!line.startsWith('#') && line.endsWith('.m3u8')) {
                const playlistUrl = line.startsWith('http') ? line : new URL(line, baseUrl).href;
                modifiedLines.push(`/stream?url=${encodeURIComponent(playlistUrl)}`);
            }
            // Handle segment URLs (not starting with # and not empty)
            else if (!line.startsWith('#') && line.length > 0) {
                // This is likely a segment URL
                const segmentUrl = line.startsWith('http') ? line : new URL(line, baseUrl).href;
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
app.get("/embed", (req, res) => {
    const streamUrl = req.query.url;
    if (!streamUrl) {
        return res.status(400).send("Stream URL is required as a query parameter");
    }
    
    // Get server origin (protocol + host)
    const serverOrigin = `${req.protocol}://${req.get('host')}`;
    
    const embedHtml = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Stream Player</title>
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
        </script>
    </body>
    </html>
    `;
    
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

// Homepage with form to enter M3U8 URL
app.get("/", (req, res) => {
    // Get server origin (protocol + host)
    const serverOrigin = `${req.protocol}://${req.get('host')}`;
    
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>M3U8 Stream Proxy</title>
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
            h1 {
                color: #333;
            }
            .embed-example {
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
        </style>
    </head>
    <body>
        <h1>M3U8 Stream Proxy</h1>
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
        
        <div id="result" style="display:none; margin-top:20px;">
            <h2>Embed Code</h2>
            <p>Copy and paste this code to embed the player in your website:</p>
            <textarea id="embed-code-result" readonly></textarea>
            
            <h2>Direct Stream URL</h2>
            <p>Use this URL in media players that support HLS:</p>
            <textarea id="direct-link-result" readonly></textarea>
            
            <div class="embed-example">
                <h3>How to Use</h3>
                <p>To embed this player in your website:</p>
                <ol>
                    <li>Copy the embed code above</li>
                    <li>Paste it into your HTML where you want the player to appear</li>
                    <li>Adjust the width and height attributes as needed</li>
                </ol>
                
                <p>You can also use the direct stream URL with video players that support HLS:</p>
                <ul>
                    <li>VLC Media Player</li>
                    <li>JW Player</li>
                    <li>Video.js with HLS support</li>
                    <li>And many others</li>
                </ul>
            </div>
        </div>
        
        <script>
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
                
                document.getElementById('result').style.display = 'block';
            }
            
            function openEmbedPlayer() {
                const url = document.getElementById('m3u8-url').value.trim();
                if (!url) {
                    alert('Please enter a valid M3U8 URL');
                    return;
                }
                
                window.open('/embed?url=' + encodeURIComponent(url), '_blank');
            }
        </script>
    </body>
    </html>
    `;
    
    res.send(html);
});

// Set up server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Proxy server running on http://localhost:${PORT}`));