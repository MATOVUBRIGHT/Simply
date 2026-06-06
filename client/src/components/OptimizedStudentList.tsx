// client/src/components/OptimizedStudentList.tsx
// Example: Optimized student list with virtualization and memoization

import { useMemo, useCallback, memo } from 'react';
import { VirtualizedList } from './VirtualizedList';
import { usePagination } from '../hooks/usePagination';
import { useDebounce } from '../hooks/useDebounce';
import { performanceMonitor } from '../services/performanceMonitor';
import type { Student } from '@schofy/shared';

interface StudentListProps {
  students: Student[];
  onSelectStudent: (student: Student) => void;
  onEdit: (student: Student) => void;
  onDelete: (studentId: string) => void;
  loading?: boolean;
}

const StudentListItem = memo(function StudentListItem({
  student,
  onSelect,
  onEdit,
  onDelete,
}: {
  student: Student;
  onSelect: (student: Student) => void;
  onEdit: (student: Student) => void;
  onDelete: (studentId: string) => void;
}) {
  return (
    <div
      className="flex items-center p-3 hover:bg-gray-50 border-b cursor-pointer"
      onClick={() => onSelect(student)}
    >
      <div className="flex-1">
        <p className="font-medium">{student.firstName} {student.lastName}</p>
        <p className="text-sm text-gray-500">{student.admissionNo}</p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit(student);
          }}
          className="text-blue-600 hover:text-blue-800"
        >
          Edit
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(student.id);
          }}
          className="text-red-600 hover:text-red-800"
        >
          Delete
        </button>
      </div>
    </div>
  );
});

// Export for external use
export { StudentListItem };

/**
 * Optimized student list component
 * - Pagination: Only loads current page
 * - Virtualization: Only renders visible items  
 * - Memoization: Prevents unnecessary re-renders
 * - Result: Smooth performance with 10k+ students
 */
export const OptimizedStudentList = memo(function OptimizedStudentList({
  students: allStudents,
  onSelectStudent,
  onEdit,
  onDelete,
  loading,
}: StudentListProps) {
  const [searchQuery, setSearchQuery] = '' as any;
  const [debouncedQuery] = useDebounce(searchQuery, 300);

  // Filter students based on search
  const filteredStudents = useMemo(() => {
    if (!debouncedQuery) return allStudents;
    
    return performanceMonitor.measureSync(
      'student-filter',
      () =>
        allStudents.filter(
          student =>
            student.firstName.toLowerCase().includes(debouncedQuery.toLowerCase()) ||
            student.lastName.toLowerCase().includes(debouncedQuery.toLowerCase()) ||
            student.admissionNo.toLowerCase().includes(debouncedQuery.toLowerCase())
        ),
      'data'
    );
  }, [allStudents, debouncedQuery]);

  // Pagination
  const pagination = usePagination(filteredStudents, {
    pageSize: 20,
    initialPage: 1,
  });

  const handleSelectStudent = useCallback(
    (student: Student) => {
      void onSelectStudent(student);
    },
    [onSelectStudent]
  );

  const handleEdit = useCallback(
    (student: Student) => {
      void onEdit(student);
    },
    [onEdit]
  );

  const handleDelete = useCallback(
    (studentId: string) => {
      void onDelete(studentId);
    },
    [onDelete]
  );

  if (loading) {
    return (
      <div className="flex min-h-[220px] items-center justify-center p-4">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-transparent" style={{ borderTopColor: 'var(--primary-color)' }} />
          <p className="mt-3 text-sm font-semibold text-slate-400">Loading students...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Search input */}
      <input
        type="text"
        placeholder="Search by name or admission number..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {/* Results count */}
      <div className="text-sm text-gray-600">
        Showing {pagination.items.length} of {filteredStudents.length} students
        {filteredStudents.length > 0 && (
          <span className="ml-2">
            (Page {pagination.currentPage} of {pagination.totalPages})
          </span>
        )}
      </div>

      {/* Virtualized list */}
      <VirtualizedList
        items={pagination.items}
        itemHeight={80}
        containerHeight={500}
        renderItem={(student: Student) => (
          <StudentListItem
            student={student}
            onSelect={handleSelectStudent}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        )}
        keyExtractor={(student: Student) => student.id}
      />

      {/* Pagination controls */}
      <div className="flex gap-2 justify-center items-center">
        <button
          onClick={() => pagination.prevPage()}
          disabled={!pagination.hasPrevPage}
          className="px-4 py-2 bg-gray-200 disabled:opacity-50 rounded"
        >
          Previous
        </button>
        <span>{pagination.currentPage} / {pagination.totalPages}</span>
        <button
          onClick={() => pagination.nextPage()}
          disabled={!pagination.hasNextPage}
          className="px-4 py-2 bg-gray-200 disabled:opacity-50 rounded"
        >
          Next
        </button>
      </div>
    </div>
  );
});

OptimizedStudentList.displayName = 'OptimizedStudentList';
