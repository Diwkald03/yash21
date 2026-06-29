/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Emit a self-contained server bundle for a lean Docker image (Railway).
  output: "standalone",
};

module.exports = nextConfig;
