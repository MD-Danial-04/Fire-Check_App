/** @type {import('next').NextConfig} */
const nextConfig = {
  // Server Actions are available by default in Next.js 14.1.0
  webpack: (config, { isServer }) => {
    // Disable source maps for specific files
    if (!isServer) {
      // Add source map loader for handling problematic source maps
      config.module.rules.push({
        test: /installHook\.js$|%3Canonymous%20code%3E$/,
        use: [
          {
            loader: 'source-map-loader',
            options: {
              filterSourceMappingUrl: (url, resourcePath) => {
                // Disable source map loading for problematic files
                if (resourcePath.includes('installHook.js') || 
                    resourcePath.includes('%3Canonymous%20code%3E') ||
                    resourcePath.includes('<anonymous code>')) {
                  return false;
                }
                return true;
              },
            },
          },
        ],
      });
      
      // Also configure devtool to control source map generation
      config.devtool = 'eval-source-map';
    }
    
    return config;
  },
  // Add experimental flag to ensure environment variables are properly processed
  experimental: {
    // This ensures that environment variables are properly loaded
    esmExternals: 'loose'
  }
}

module.exports = nextConfig 