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
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }]
  },
};

export default nextConfig;
