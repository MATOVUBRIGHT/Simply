import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@schofy/shared': path.resolve(__dirname, '../shared/src')
    }
  },
  // Strip console.log/debug in production
  esbuild: {
    drop: mode === 'production' ? ['console', 'debugger'] : [],
  },
  server: {
    host: true,
    port: 4201,
    strictPort: false,
    // Pre-bundle heavy deps for faster HMR
    warmup: {
      clientFiles: [
        './src/App.tsx',
        './src/pages/Dashboard.tsx',
        './src/pages/Students.tsx',
        './src/components/Layout.tsx',
        './src/lib/store.ts',
        './src/lib/database/SupabaseDataService.ts',
      ],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3334',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 700,
    target: 'es2020',
    minify: 'esbuild',
    rollupOptions: {
      output: {
        // Granular manual chunks — keeps initial bundle tiny
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('lucide-react')) return 'vendor-icons';
          if (id.includes('jspdf') || id.includes('jspdf-autotable')) return 'vendor-jspdf';
          if (id.includes('xlsx')) return 'vendor-xlsx';
          if (id.includes('html2canvas')) return 'vendor-html2canvas';
          if (id.includes('dompurify')) return 'vendor-sanitize';
          if (id.includes('recharts') || id.includes('d3-') || id.includes('victory')) return 'vendor-charts';
          if (id.includes('@supabase')) return 'vendor-supabase';
          if (id.includes('react-router')) return 'vendor-router';
          if (id.includes('react-dom')) return 'vendor-react-dom';
          if (id.includes('react') && !id.includes('react-dom') && !id.includes('react-router')) return 'vendor-react';
          if (id.includes('@tanstack')) return 'vendor-query';
          if (id.includes('dexie')) return 'vendor-dexie';
          return 'vendor-misc';
        }
      }
    }
  }
}));
