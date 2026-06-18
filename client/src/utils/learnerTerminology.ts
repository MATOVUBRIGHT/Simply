export type LearnerTerm = 'pupil' | 'student' | 'learner';

export type LearnerTerms = {
  singular: string;
  plural: string;
  singularLower: string;
  pluralLower: string;
};

const DEFAULT_TERMS: LearnerTerms = {
  singular: 'Student',
  plural: 'Students',
  singularLower: 'student',
  pluralLower: 'students',
};

function normalizeSchoolType(value?: string | null) {
  return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export function getLearnerTermForSchoolType(schoolType?: string | null): LearnerTerm {
  const type = normalizeSchoolType(schoolType);

  if (type === 'nursery' || type === 'primary' || type === 'nursery_primary') {
    return 'pupil';
  }

  if (type === 'secondary') {
    return 'student';
  }

  if (type === 'primary_secondary' || type === 'all') {
    return 'learner';
  }

  return 'student';
}

export function getLearnerTerms(schoolType?: string | null): LearnerTerms {
  const term = getLearnerTermForSchoolType(schoolType);
  if (term === 'pupil') {
    return {
      singular: 'Pupil',
      plural: 'Pupils',
      singularLower: 'pupil',
      pluralLower: 'pupils',
    };
  }
  if (term === 'learner') {
    return {
      singular: 'Learner',
      plural: 'Learners',
      singularLower: 'learner',
      pluralLower: 'learners',
    };
  }
  return DEFAULT_TERMS;
}
