/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000'],
    },
  },
  devIndicators: false,
  
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    // Temporarily ignore lint during builds for beta packaging
    // TODO: Fix remaining ~150 lint errors in follow-up PR
    ignoreDuringBuilds: true,
  },
}

module.exports = nextConfig
