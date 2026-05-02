import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Student } from '@schofy/shared';
import { dataService } from '../lib/database/SupabaseDataService';
import { useAuth } from './AuthContext';
import { useTableData } from '../lib/store';

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
  const { user, schoolId } = useAuth();
  const tenantId = schoolId || user?.id || '';

  // Use the global store — all students, always fresh, works offline
  const { data: allStudentsData, loading, error, refresh } = useTableData(tenantId, 'students');
  const students = allStudentsData as Student[];
  const totalCount = students.length;

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

  return (
    <StudentsContext.Provider
      value={{
        students,
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
