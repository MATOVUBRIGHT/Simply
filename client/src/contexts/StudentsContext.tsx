import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Student } from '@schofy/shared';
import { dataService } from '../lib/database/DataService';
import { useAuth } from './AuthContext';
import { queryKeys } from '../lib/queryKeys';

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
  const queryClient = useQueryClient();
  const [isInitialized, setIsInitialized] = useState(false);
  const tenantId = schoolId || user?.id || '';

  useEffect(() => {
    if (authLoading) {
      setIsInitialized(false);
      return;
    }
    setIsInitialized(!!(user?.id || schoolId));
  }, [user, schoolId, authLoading]);

  const debouncedInvalidateRef = useRef<number | undefined>(undefined);

  const scheduleStudentsInvalidate = useCallback(() => {
    if (!tenantId) return;
    if (debouncedInvalidateRef.current) clearTimeout(debouncedInvalidateRef.current);
    debouncedInvalidateRef.current = window.setTimeout(() => {
      debouncedInvalidateRef.current = undefined;
      void queryClient.invalidateQueries({ queryKey: queryKeys.studentsPage1(tenantId) });
    }, 350);
  }, [queryClient, tenantId]);

  useEffect(() => {
    const onRefresh = () => scheduleStudentsInvalidate();
    window.addEventListener('studentsUpdated', onRefresh as EventListener);
    window.addEventListener('StudentsUpdated', onRefresh as EventListener);
    window.addEventListener('dataRefresh', onRefresh as EventListener);
    window.addEventListener('schofyDataRefresh', onRefresh as EventListener);
    window.addEventListener('studentsDataChanged', onRefresh as EventListener);
    return () => {
      if (debouncedInvalidateRef.current) clearTimeout(debouncedInvalidateRef.current);
      window.removeEventListener('studentsUpdated', onRefresh as EventListener);
      window.removeEventListener('StudentsUpdated', onRefresh as EventListener);
      window.removeEventListener('dataRefresh', onRefresh as EventListener);
      window.removeEventListener('schofyDataRefresh', onRefresh as EventListener);
      window.removeEventListener('studentsDataChanged', onRefresh as EventListener);
    };
  }, [scheduleStudentsInvalidate]);

  const studentsQuery = useQuery({
    queryKey: queryKeys.studentsPage1(tenantId),
    queryFn: async () => {
      const r = await dataService.getPage(tenantId, 'students', 1, 50);
      return r;
    },
    enabled: !!tenantId && isInitialized,
    staleTime: 0,
    gcTime: 30 * 60_000,
    placeholderData: (previousData) => previousData,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const studentsSubset = (studentsQuery.data?.items ?? []) as Student[];
  const totalCount = studentsQuery.data?.total ?? 0;
  const error = studentsQuery.error ? 'Failed to load students' : null;

  const refresh = useCallback(() => {
    if (tenantId) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.studentsPage1(tenantId) });
    }
  }, [queryClient, tenantId]);

  const loadPage = useCallback(
    async (page: number, pageSize: number, filter?: (item: any) => boolean) => {
      const id = schoolId || user?.id;
      if (!id) return { items: [], total: 0 };
      return await dataService.getPage(id, 'students', page, pageSize, filter);
    },
    [user, schoolId]
  );

  const searchStudents = useCallback(
    async (query: string) => {
      const id = schoolId || user?.id;
      if (!id) return [];
      return await dataService.search(id, 'students', query, ['firstName', 'lastName', 'admissionNo', 'studentId']);
    },
    [user, schoolId]
  );

  const loading = useMemo(
    () => authLoading || !isInitialized || (studentsQuery.isLoading && !studentsQuery.data),
    [authLoading, isInitialized, studentsQuery.isLoading, studentsQuery.data]
  );

  return (
    <StudentsContext.Provider
      value={{
        students: studentsSubset,
        totalCount,
        loading,
        error,
        refresh,
        loadPage,
        searchStudents,
      }}
    >
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
  return students.filter((s) => s.status === 'active');
}

export function useCompletedStudents() {
  const { students } = useStudents();
  return students.filter((s) => s.status === 'completed' || s.status === 'graduated');
}

export function useInactiveStudents() {
  const { students } = useStudents();
  return students.filter((s) => s.status === 'inactive');
}
