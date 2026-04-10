import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { Student } from '@schofy/shared';
import { dataService } from '../lib/database/DataService';
import { useAuth } from './AuthContext';

interface StudentsContextType {
  students: Student[];
  totalCount: number;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  loadPage: (page: number, pageSize: number, filter?: (item: any) => boolean) => Promise<{ items: Student[]; total: number }>;
  searchStudents: (query: string) => Promise<Student[]>;
}

const StudentsContext = createContext<StudentsContextType | undefined>(undefined);

export function StudentsProvider({ children }: { children: React.ReactNode }) {
  const { user, schoolId, loading: authLoading } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [studentsSubset, setStudentsSubset] = useState<Student[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (authLoading) {
      setIsInitialized(false);
      setStudentsSubset([]);
      return;
    }

    if (user?.id || schoolId) {
      setIsInitialized(true);
    } else {
      setIsInitialized(false);
      setStudentsSubset([]);
    }
  }, [user, schoolId, authLoading]);

  const loadInitialData = useCallback(async () => {
    const id = schoolId || user?.id;
    if (!id || !isInitialized) return;
    
    try {
      // Load first page as initial subset for quick access
      const { items, total } = await dataService.getPage(id, 'students', 1, 50);
      setStudentsSubset(items);
      setTotalCount(total);
      setError(null);
    } catch (err) {
      console.error('Failed to load students:', err);
      setError('Failed to load students');
    }
  }, [user, isInitialized]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData, refreshKey]);

  useEffect(() => {
    const handleStudentsUpdated = (event?: CustomEvent) => {
      if (event) {
        console.log('🔄 StudentsContext: Real-time update received', event.detail);
      }
      setRefreshKey(k => k + 1);
    };
    const handleDataRefresh = (event?: CustomEvent) => {
      if (event) {
        console.log('🔄 StudentsContext: General data refresh', event.detail);
      }
      setRefreshKey(k => k + 1);
    };
    const handleStudentsDataChanged = (event: CustomEvent) => {
      console.log('🔄 StudentsContext: Specific students data changed', event.detail);
      setRefreshKey(k => k + 1);
    };
    
    // Listen for all types of real-time events
    window.addEventListener('studentsUpdated', handleStudentsUpdated as EventListener);
    window.addEventListener('StudentsUpdated', handleStudentsUpdated as EventListener);
    window.addEventListener('dataRefresh', handleDataRefresh as EventListener);
    window.addEventListener('schofyDataRefresh', handleDataRefresh as EventListener);
    window.addEventListener('studentsDataChanged', handleStudentsDataChanged as EventListener);
    
    return () => {
      window.removeEventListener('studentsUpdated', handleStudentsUpdated as EventListener);
      window.removeEventListener('StudentsUpdated', handleStudentsUpdated as EventListener);
      window.removeEventListener('dataRefresh', handleDataRefresh as EventListener);
      window.removeEventListener('schofyDataRefresh', handleDataRefresh as EventListener);
      window.removeEventListener('studentsDataChanged', handleStudentsDataChanged as EventListener);
    };
  }, []);

  const refresh = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  const loadPage = useCallback(async (page: number, pageSize: number, filter?: (item: any) => boolean) => {
    const id = schoolId || user?.id;
    if (!id) return { items: [], total: 0 };
    return await dataService.getPage(id, 'students', page, pageSize, filter);
  }, [user, schoolId]);

  const searchStudents = useCallback(async (query: string) => {
    const id = schoolId || user?.id;
    if (!id) return [];
    return await dataService.search(id, 'students', query, ['firstName', 'lastName', 'admissionNo', 'studentId']);
  }, [user, schoolId]);

  const loading = authLoading || !isInitialized;

  return (
    <StudentsContext.Provider value={{ 
      students: studentsSubset, 
      totalCount,
      loading, 
      error, 
      refresh, 
      loadPage,
      searchStudents
    }}>
      {children}
    </StudentsContext.Provider>
  );
}

export function useStudents() {
  const context = useContext(StudentsContext);
  if (context === undefined) {
    throw new Error('useStudents must be used within a StudentsProvider');
  }
  return context;
}

export function useActiveStudents() {
  const { students } = useStudents();
  return students.filter(s => s.status === 'active');
}

export function useCompletedStudents() {
  const { students } = useStudents();
  return students.filter(s => s.status === 'completed' || s.status === 'graduated');
}

export function useInactiveStudents() {
  const { students } = useStudents();
  return students.filter(s => s.status === 'inactive');
}
