import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import Parser from "rss-parser";
import axios from "axios";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const parser = new Parser({
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36 PulsePoint/1.0',
  },
});

// Simple in-memory cache
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // RSS Proxy Endpoint
  app.get("/api/rss", async (req, res) => {
    const { url } = req.query;
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "URL is required" });
    }

    // Check cache
    const cached = cache.get(url);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return res.json(cached.data);
    }

    try {
      // Use axios for the initial fetch to have better control over headers and errors
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        },
        timeout: 15000, // 15s timeout
      });

      let cleanedData = response.data;

      // If it's HTML, it's definitely not a valid RSS feed
      if (typeof cleanedData === 'string' && cleanedData.trim().toLowerCase().startsWith('<!doctype html')) {
        throw new Error("Received HTML instead of RSS/XML. The feed URL might be incorrect or the site is blocking the request.");
      }

      // Clean XML content to handle common entity errors (like unescaped ampersands)
      cleanedData = cleanedData.replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[a-f\d]+);)/gi, '&amp;');
      
      // Fix "Attribute without value" errors (e.g. <div hidden>)
      // This regex looks for attributes inside tags that don't have an equals sign
      cleanedData = cleanedData.replace(/<([a-zA-Z0-9:]+)([^>]+)>/g, (match: string, tagName: string, attrs: string) => {
        // Only fix if it looks like it has attributes without values
        // We look for words that are not followed by = and are followed by space or end of tag
        const fixedAttrs = attrs.replace(/(\s+)([a-zA-Z0-9-]+)(?!\s*=)(?=\s|>)/g, '$1$2="$2"');
        return `<${tagName}${fixedAttrs}>`;
      });

      const feed = await parser.parseString(cleanedData);
      
      // Update cache
      cache.set(url, { data: feed, timestamp: Date.now() });
      
      res.json(feed);
    } catch (error: any) {
      console.error(`Error fetching RSS from ${url}:`, error.message);
      
      // If we have stale cache, serve it on error
      if (cached) {
        console.log("Serving stale cache for", url);
        return res.json(cached.data);
      }

      const status = error.response?.status || 500;
      const message = error.response?.data?.message || error.message || "Failed to fetch RSS feed";
      res.status(status).json({ error: message });
    }
  });

  // AI Summary Endpoint (Optional proxy if needed, but we call Gemini from client)
  
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
