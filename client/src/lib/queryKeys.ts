/** Shared TanStack Query keys — keep in sync with prefetch callers. */
export const queryKeys = {
  studentsPage1: (tenantId: string) => ['schofy', 'students', 'page1', tenantId] as const,
  staffPage1: (tenantId: string) => ['schofy', 'staff', 'page1', tenantId] as const,
};
