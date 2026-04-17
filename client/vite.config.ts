import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@schofy/shared': path.resolve(__dirname, '../shared/src')
    }
  },
  server: {
    host: true, // Allow connections from any IP address
    port: 4201,
    strictPort: false, // Use alternative port if 4201 is taken
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
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('lucide')) return 'vendor-icons';
            if (id.includes('jspdf') || id.includes('jspdf-autotable')) return 'vendor-jspdf';
            if (id.includes('xlsx')) return 'vendor-xlsx';
            if (id.includes('html2canvas')) return 'vendor-html2canvas';
            if (id.includes('dompurify')) return 'vendor-sanitize';
          }
        }
      }
    }
  }
});
