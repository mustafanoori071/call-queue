import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

function devApiPlugin(env) {
  return {
    name: "dev-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/")) return next();

        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.end();
          return;
        }

        if (req.url === "/api/check-passcode" && req.method === "POST") {
          let body = "";
          req.on("data", (chunk) => {
            body += chunk;
          });
          req.on("end", () => {
            const passcode = env.TEAM_PASSCODE;
            if (!passcode) {
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ required: false, ok: true }));
              return;
            }
            let code = "";
            try {
              code = JSON.parse(body || "{}").code ?? "";
            } catch {
              code = "";
            }
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ required: true, ok: code === passcode }));
          });
          return;
        }

        if (req.url === "/api/write-status" && req.method === "POST") {
          const writeUrl = env.SHEET_WRITE_URL;
          if (!writeUrl) {
            res.statusCode = 503;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: false, error: "SHEET_WRITE_URL is not configured" }));
            return;
          }

          let body = "";
          req.on("data", (chunk) => {
            body += chunk;
          });
          req.on("end", async () => {
            try {
              const upstream = await fetch(writeUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body,
                redirect: "follow",
              });
              const text = await upstream.text();
              res.statusCode = upstream.ok ? 200 : 502;
              res.setHeader("Content-Type", "application/json");
              res.end(text || JSON.stringify({ ok: upstream.ok }));
            } catch (err) {
              res.statusCode = 502;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ ok: false, error: err.message }));
            }
          });
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      react(),
      devApiPlugin(env),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["icons/*.png", "icons/*.svg"],
        manifest: {
          name: "Call Queue",
          short_name: "Call Queue",
          description: "Swipeable cold-call queue — one lead at a time.",
          theme_color: "#0B1220",
          background_color: "#0B1220",
          display: "standalone",
          orientation: "portrait",
          start_url: "/",
          icons: [
            {
              src: "icons/icon-192.png",
              sizes: "192x192",
              type: "image/png",
            },
            {
              src: "icons/icon-512.png",
              sizes: "512x512",
              type: "image/png",
            },
            {
              src: "icons/icon-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/docs\.google\.com\/.*/i,
              handler: "NetworkFirst",
              options: {
                cacheName: "google-sheets-cache",
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60,
                },
              },
            },
          ],
        },
      }),
    ],
  };
});
