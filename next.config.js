/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  basePath: process.env.PAGES_BASE_PATH || '',
  images: { unoptimized: true },
}

module.exports = nextConfig
