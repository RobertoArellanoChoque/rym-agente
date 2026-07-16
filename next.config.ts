import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
]

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  serverExternalPackages: ["exceljs", "unpdf", "@mistralai/mistralai"],
  experimental: {
    // El proxy buffea el body con cap default de 10MB y lo TRUNCA en silencio —
    // rompe multipart en /api/ingest/bulk y /api/conciliacion/ingest-batch (lotes
    // de hasta 100MB, ver MAX_BATCH_BYTES en esas rutas).
    proxyClientMaxBodySize: "100mb",
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }]
  },
};

export default nextConfig;
