import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
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
  const { user, loading: authLoading } = useAuth();
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

    if (user?.id) {
      setIsInitialized(true);
    } else {
      setIsInitialized(false);
      setStudentsSubset([]);
    }
  }, [user, authLoading]);

  const loadInitialData = useCallback(async () => {
    if (!user?.id || !isInitialized) return;
    
    try {
      // Load first page as initial subset for quick access
      const { items, total } = await dataService.getPage(user.id, 'students', 1, 50);
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
    const handleStudentsUpdated = () => {
      setRefreshKey(k => k + 1);
    };
    const handleDataRefresh = () => {
      setRefreshKey(k => k + 1);
    };
    
    window.addEventListener('studentsUpdated', handleStudentsUpdated);
    window.addEventListener('dataRefresh', handleDataRefresh);
    
    return () => {
      window.removeEventListener('studentsUpdated', handleStudentsUpdated);
      window.removeEventListener('dataRefresh', handleDataRefresh);
    };
  }, []);

  const refresh = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  const loadPage = useCallback(async (page: number, pageSize: number, filter?: (item: any) => boolean) => {
    if (!user?.id) return { items: [], total: 0 };
    return await dataService.getPage(user.id, 'students', page, pageSize, filter);
  }, [user]);

  const searchStudents = useCallback(async (query: string) => {
    if (!user?.id) return [];
    return await dataService.search(user.id, 'students', query, ['firstName', 'lastName', 'admissionNo', 'studentId']);
  }, [user]);

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
