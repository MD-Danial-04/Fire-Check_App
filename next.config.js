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
    
    // Fix for undici dependency issues on Vercel - apply to both server and client
    config.resolve.alias = {
      ...config.resolve.alias,
      'undici': require('path').join(__dirname, 'lib', 'undici-shim.js')
    };
    
    // Mark @sparticuz/chromium as external to prevent bundling
    if (isServer) {
      config.externals = [...(config.externals || []), '@sparticuz/chromium'];
    }
    
    return config;
  },
  // Configure for Playwright and serverless environment
  experimental: {
    // This ensures that environment variables are properly loaded
    esmExternals: 'loose',
    // Increase serverless function timeout for Playwright operations
    serverComponentsExternalPackages: ['playwright', 'playwright-core'],
    // Configure larger function size limits
    largePageDataBytes: 128 * 1000, // 128KB, default is 128KB
    serverActions: {
      bodySizeLimit: '4mb' // Increase the limit to accommodate Playwright
    }
  },
  // Update serverless function settings to support browser automation
  serverRuntimeConfig: {
    PROJECT_ROOT: __dirname
  }
}

module.exports = nextConfig 