import { sentryVitePlugin } from '@sentry/vite-plugin'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import path, { resolve } from 'path'
import { visualizer } from 'rollup-plugin-visualizer'
import type { Plugin } from 'vite'
import packageJson from './release/app/package.json'

// DOMMatrix polyfill code - 必须在模块加载前执行
const DOMMATRIX_POLYFILL = `
// DOMMatrix polyfill for pdf-parse - must run before any module loads
(function() {
  if (typeof globalThis.DOMMatrix === 'undefined') {
    var DOMMatrix = function(input) {
      this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
      this.m11 = 1; this.m12 = 0; this.m13 = 0; this.m14 = 0;
      this.m21 = 0; this.m22 = 1; this.m23 = 0; this.m24 = 0;
      this.m31 = 0; this.m32 = 0; this.m33 = 1; this.m34 = 0;
      this.m41 = 0; this.m42 = 0; this.m43 = 0; this.m44 = 1;
      if (input && typeof input === 'string') {
        var match = input.match(/matrix\\(([^)]+)\\)/);
        if (match) {
          var values = match[1].split(',').map(Number);
          if (values.length === 6) {
            this.a = values[0]; this.b = values[1]; this.c = values[2];
            this.d = values[3]; this.e = values[4]; this.f = values[5];
            this.m11 = values[0]; this.m12 = values[1];
            this.m21 = values[2]; this.m22 = values[3];
            this.m41 = values[4]; this.m42 = values[5];
          }
        }
      }
    };
    DOMMatrix.prototype.multiply = function() { return new DOMMatrix(); };
    DOMMatrix.prototype.translate = function() { return new DOMMatrix(); };
    DOMMatrix.prototype.scale = function() { return new DOMMatrix(); };
    DOMMatrix.prototype.rotate = function() { return new DOMMatrix(); };
    DOMMatrix.prototype.flipX = function() { return new DOMMatrix(); };
    DOMMatrix.prototype.flipY = function() { return new DOMMatrix(); };
    DOMMatrix.prototype.inverse = function() { return new DOMMatrix(); };
    DOMMatrix.prototype.toString = function() { return 'matrix(' + this.a + ', ' + this.b + ', ' + this.c + ', ' + this.d + ', ' + this.e + ', ' + this.f + ')'; };
    globalThis.DOMMatrix = DOMMatrix;
    global.global = globalThis;
  }
})();
`

/**
 * Vite plugin to inject DOMMatrix polyfill at the very beginning of the main process bundle
 * This ensures the polyfill is available before pdf-parse or any other module tries to use it
 */
export function injectDOMMatrixPolyfill(): Plugin {
  let injected = false
  return {
    name: 'inject-dommatrix-polyfill',
    transform(code, id) {
      // Only inject into the main entry file
      if (id.endsWith('main.ts') && !injected) {
        injected = true
        // Inject at the beginning of the source code
        return DOMMATRIX_POLYFILL + '\n' + code
      }
      return null
    },
  }
}

/**
 * Vite plugin to inject <base href="/"> for web builds
 * This ensures relative paths resolve correctly for SPA routes like /session/xxx
 */
export function injectBaseTag(): Plugin {
  return {
    name: 'inject-base-tag',
    transformIndexHtml() {
      return [
        {
          tag: 'base',
          attrs: { href: '/' },
          injectTo: 'head-prepend', // Inject at the beginning of <head>
        },
      ]
    },
  }
}

/**
 * Vite plugin to replace dvh units with vh units
 * This replaces the webpack string-replace-loader functionality
 */
export function dvhToVh(): Plugin {
  return {
    name: 'dvh-to-vh',
    transform(code, id) {
      if (id.endsWith('.css') || id.endsWith('.scss') || id.endsWith('.sass')) {
        return {
          code: code.replace(/(\d+)dvh/g, '$1vh'),
          map: null,
        }
      }
      return null
    },
  }
}

const inferredRelease = process.env.SENTRY_RELEASE || packageJson.version
const inferredDist = process.env.SENTRY_DIST || undefined

process.env.SENTRY_RELEASE = inferredRelease
if (inferredDist) {
  process.env.SENTRY_DIST = inferredDist
}

export default defineConfig(({ mode }) => {
  const isProduction = mode === 'production'
  const isWeb = process.env.CHATBOX_BUILD_PLATFORM === 'web'

  return {
    main: {
      plugins: [
        injectDOMMatrixPolyfill(),
        ...(isProduction
          ? [
              visualizer({
                filename: 'release/app/dist/main/stats.html',
                open: false,
                title: 'Main Process Dependency Analysis',
              }),
            ]
          : [externalizeDepsPlugin()]),
        process.env.SENTRY_AUTH_TOKEN
          ? sentryVitePlugin({
              authToken: process.env.SENTRY_AUTH_TOKEN,
              org: 'sentry',
              project: 'chatbox',
              url: 'https://sentry.midway.run/',
              release: {
                name: inferredRelease,
                ...(inferredDist ? { dist: inferredDist } : {}),
              },
              sourcemaps: {
                assets: isProduction ? 'release/app/dist/main/**' : 'output/main/**',
              },
              telemetry: false,
            })
          : undefined,
      ].filter(Boolean),
      build: {
        outDir: isProduction ? 'release/app/dist/main' : undefined,
        lib: {
          entry: resolve(__dirname, 'src/main/main.ts'),
        },
        sourcemap: isProduction ? 'hidden' : true,
        minify: isProduction,
        rollupOptions: {
          external: [
            ...Object.keys(packageJson.dependencies || {}),
            'electron',
            'electron-debug',
            'electron-log',
            'electron-log/main',
            'electron-store',
            'electron-updater',
            'electron-devtools-installer',
            'auto-launch',
          ],
          output: {
            entryFileNames: '[name].js',
            inlineDynamicImports: true,
          },
        },
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, './src/renderer'),
          'src/shared': path.resolve(__dirname, './src/shared'),
        },
      },
      define: {
        'process.type': '"browser"',
        'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
        'process.env.CHATBOX_BUILD_TARGET': JSON.stringify(process.env.CHATBOX_BUILD_TARGET || 'unknown'),
        'process.env.CHATBOX_BUILD_PLATFORM': JSON.stringify(process.env.CHATBOX_BUILD_PLATFORM || 'unknown'),
        'process.env.USE_LOCAL_API': JSON.stringify(process.env.USE_LOCAL_API || ''),
        'process.env.USE_BETA_API': JSON.stringify(process.env.USE_BETA_API || ''),
      },
    },
    preload: {
      plugins: [
        visualizer({
          filename: 'release/app/dist/preload/stats.html',
          open: false,
          title: 'Preload Process Dependency Analysis',
        }),
      ],
      build: {
        outDir: isProduction ? 'release/app/dist/preload' : undefined,
        lib: {
          entry: resolve(__dirname, 'src/preload/index.ts'),
        },
        sourcemap: isProduction ? 'hidden' : true,
        minify: isProduction,
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, './src/renderer'),
          'src/shared': path.resolve(__dirname, './src/shared'),
        },
      },
    },
    renderer: {
      resolve: {
        alias: {
          '@': path.resolve(__dirname, 'src/renderer'),
          '@shared': path.resolve(__dirname, 'src/shared'),
        },
      },
      plugins: [
        TanStackRouterVite({
          target: 'react',
          autoCodeSplitting: true,
          routesDirectory: './src/renderer/routes',
          generatedRouteTree: './src/renderer/routeTree.gen.ts',
        }),
        react({}),
        dvhToVh(),
        isWeb ? injectBaseTag() : undefined,
        visualizer({
          filename: 'release/app/dist/renderer/stats.html',
          open: false,
          title: 'Renderer Process Dependency Analysis',
        }),
        process.env.SENTRY_AUTH_TOKEN
          ? sentryVitePlugin({
              authToken: process.env.SENTRY_AUTH_TOKEN,
              org: 'sentry',
              project: 'chatbox',
              url: 'https://sentry.midway.run/',
              release: {
                name: inferredRelease,
                ...(inferredDist ? { dist: inferredDist } : {}),
              },
              sourcemaps: {
                assets: isProduction ? 'release/app/dist/renderer/**' : 'output/renderer/**',
              },
              telemetry: false,
            })
          : undefined,
      ].filter(Boolean),
      build: {
        outDir: isProduction ? 'release/app/dist/renderer' : undefined,
        target: 'es2020', // Avoid static initialization blocks for browser compatibility
        sourcemap: isProduction ? 'hidden' : true,
        minify: isProduction ? 'esbuild' : false, // Use esbuild for faster, less memory-intensive minification
        rollupOptions: {
          output: {
            entryFileNames: 'js/[name].[hash].js',
            chunkFileNames: 'js/[name].[hash].js',
            assetFileNames: (assetInfo) => {
              if (assetInfo.name?.endsWith('.css')) {
                return 'styles/[name].[hash][extname]'
              }
              if (/\.(woff|woff2|eot|ttf|otf)$/i.test(assetInfo.name || '')) {
                return 'fonts/[name].[hash][extname]'
              }
              if (/\.(png|jpg|jpeg|gif|svg|webp|ico)$/i.test(assetInfo.name || '')) {
                return 'images/[name].[hash][extname]'
              }
              return 'assets/[name].[hash][extname]'
            },
            // Optimize chunk splitting to reduce memory usage during build
            manualChunks(id) {
              if (id.includes('node_modules')) {
                // Split large vendor chunks
                if (id.includes('@ai-sdk') || id.includes('ai/')) {
                  return 'vendor-ai'
                }
                if (id.includes('@mantine') || id.includes('@tabler')) {
                  return 'vendor-ui'
                }
                if (id.includes('mermaid') || id.includes('d3')) {
                  return 'vendor-charts'
                }
              }
            },
          },
        },
      },
      css: {
        modules: {
          generateScopedName: '[name]__[local]___[hash:base64:5]',
        },
        postcss: './postcss.config.cjs',
      },
      server: {
        port: 1212,
        strictPort: true,
      },
      define: {
        'process.type': '"renderer"',
        'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
        'process.env.CHATBOX_BUILD_TARGET': JSON.stringify(process.env.CHATBOX_BUILD_TARGET || 'unknown'),
        'process.env.CHATBOX_BUILD_PLATFORM': JSON.stringify(process.env.CHATBOX_BUILD_PLATFORM || 'unknown'),
        'process.env.USE_LOCAL_API': JSON.stringify(process.env.USE_LOCAL_API || ''),
        'process.env.USE_BETA_API': JSON.stringify(process.env.USE_BETA_API || ''),
      },
      optimizeDeps: {
        include: [
          'mermaid',
          '@mantine/core',
          '@mantine/hooks',
          '@mui/material',
          '@mui/icons-material',
          '@emotion/react',
          '@emotion/styled',
          '@mui/material/styles',
        ],
        esbuildOptions: {
          target: 'es2015',
        },
      },
    },
  }
})
