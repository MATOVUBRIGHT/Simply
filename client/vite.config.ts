import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => ({
  base: mode.startsWith('desktop') ? './' : '/',
  plugins: [
    react(),
    {
      name: 'schofy-release-icons',
      transformIndexHtml(html) {
        if (!mode.includes('unlocked')) return html;
        return html
          .replace(/(href=["'][^"']*)favicon\.png/g, '$1favicon-unlocked.png')
          .replace(/(href=["'][^"']*)icon-192\.png/g, '$1icon-192-unlocked.png')
          .replace(/(href=["'][^"']*)icon-512\.png/g, '$1icon-512-unlocked.png');
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@schofy/shared': path.resolve(__dirname, '../shared/src')
    }
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
    reportCompressedSize: false,
    chunkSizeWarningLimit: 1000, // Raised to 1MB since we have good chunking
    target: 'es2020',
    minify: 'oxc',
    rollupOptions: {
      output: {
        // Granular manual chunks — keeps initial bundle tiny
        manualChunks: (id) => {
          // App code chunking by route
          if (!id.includes('node_modules')) {
            if (id.includes('/pages/')) {
              // Split large page bundles
              if (id.includes('Students.tsx') || id.includes('StudentForm.tsx') || id.includes('StudentProfile.tsx')) return 'pages-students';
              if (id.includes('Staff.tsx') || id.includes('StaffForm.tsx')) return 'pages-staff';
              if (id.includes('Finance.tsx') || id.includes('Invoices.tsx') || id.includes('Payroll.tsx')) return 'pages-finance';
              if (id.includes('Grades.tsx') || id.includes('ExamMarks.tsx') || id.includes('ReportCard.tsx')) return 'pages-academic';
              if (id.includes('Reports.tsx') || id.includes('Dashboard.tsx')) return 'pages-reports';
              return 'pages-other';
            }
            if (id.includes('/admin/')) return 'admin';
            return undefined; // Let Vite decide for other app code
          }
          // Vendor chunking
          if (id.includes('lucide-react')) return 'vendor-icons';
          if (id.includes('jspdf') || id.includes('jspdf-autotable')) return 'vendor-jspdf';
          if (id.includes('xlsx')) return 'vendor-xlsx';
          if (id.includes('html2canvas')) return 'vendor-html2canvas';
          if (id.includes('dompurify')) return 'vendor-sanitize';
          if (id.includes('recharts') || id.includes('d3-') || id.includes('victory')) return 'vendor-charts';
          if (id.includes('@supabase')) return 'vendor-supabase';
          if (id.includes('react-router')) return 'vendor-router';
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/') || id.includes('node_modules/scheduler/')) return 'vendor-react';
          if (id.includes('@tanstack')) return 'vendor-query';
          if (id.includes('dexie')) return 'vendor-dexie';
          return 'vendor-misc';
        }
      }
    }
  }
}));
