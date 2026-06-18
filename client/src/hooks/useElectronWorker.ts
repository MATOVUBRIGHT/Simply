
import { useState, useEffect, useCallback, useRef } from 'react';
import { isDesktopApp } from '../utils/desktopSyncPreference';

interface WorkerProgress {
  progress: number;
  processed: number;
  total: number;
}

export function useElectronWorker() {
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<WorkerProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const progressCallbackRef = useRef<((message: WorkerProgress) => void) | null>(null);

  // Helper to check if electronAPI is available
  const isElectron = isDesktopApp();

  // Progress listener
  useEffect(() => {
    if (!isElectron) return;

    const handleProgress = (message: WorkerProgress) => {
      setProgress(message);
      if (progressCallbackRef.current) {
        progressCallbackRef.current(message);
      }
    };

    (window as any).electronAPI?.onWorkerProgress(handleProgress);

    return () => {
      (window as any).electronAPI?.removeWorkerProgressListener(handleProgress);
    };
  }, [isElectron]);

  // Generate invoice using worker
  const generateInvoice = useCallback(async (payload: any) => {
    if (!isElectron) {
      // Fallback for browser
      console.warn('Electron worker not available, using browser fallback');
      return await new Promise(resolve => setTimeout(() => resolve({ success: true, data: payload }), 500));
    }

    setIsLoading(true);
    setError(null);
    setProgress(null);
    setResult(null);

    try {
      const result = await (window as any).electronAPI.workerGenerateInvoice(payload);
      setResult(result);
      return result;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [isElectron]);

  // Generate PDF using worker
  const generatePDF = useCallback(async (payload: any) => {
    if (!isElectron) {
      console.warn('Electron worker not available, using browser fallback');
      return await new Promise(resolve => setTimeout(() => resolve({ success: true, data: payload }), 800));
    }

    setIsLoading(true);
    setError(null);
    setProgress(null);
    setResult(null);

    try {
      const result = await (window as any).electronAPI.workerGeneratePDF(payload);
      setResult(result);
      return result;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [isElectron]);

  // Process bulk student operation using worker
  const processBulkStudent = useCallback(async (payload: any, onProgress?: (p: WorkerProgress) => void) => {
    if (onProgress) {
      progressCallbackRef.current = onProgress;
    }

    if (!isElectron) {
      console.warn('Electron worker not available, using browser fallback');
      return await new Promise(resolve => setTimeout(() => resolve({ success: true, results: [] }), 1000));
    }

    setIsLoading(true);
    setError(null);
    setProgress(null);
    setResult(null);

    try {
      const result = await (window as any).electronAPI.workerBulkStudent(payload);
      setResult(result);
      return result;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
      progressCallbackRef.current = null;
    }
  }, [isElectron]);

  // Process export using worker
  const processExport = useCallback(async (payload: any) => {
    if (!isElectron) {
      console.warn('Electron worker not available, using browser fallback');
      return await new Promise(resolve => setTimeout(() => resolve({ success: true, exportFile: {} }), 1000));
    }

    setIsLoading(true);
    setError(null);
    setProgress(null);
    setResult(null);

    try {
      const result = await (window as any).electronAPI.workerProcessExport(payload);
      setResult(result);
      return result;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [isElectron]);

  // Reset state
  const reset = useCallback(() => {
    setIsLoading(false);
    setProgress(null);
    setError(null);
    setResult(null);
  }, []);

  return {
    isElectron,
    isLoading,
    progress,
    error,
    result,
    generateInvoice,
    generatePDF,
    processBulkStudent,
    processExport,
    reset,
  };
}
