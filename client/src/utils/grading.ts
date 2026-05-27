export type GradingScaleRow = {
  grade: string;
  min: number;
  max: number;
  points: number;
  remark: string;
};

export const DEFAULT_GRADING_SCALE: GradingScaleRow[] = [
  { grade: 'D1', min: 90, max: 100, points: 1, remark: 'Distinction' },
  { grade: 'D2', min: 85, max: 89, points: 2, remark: 'Distinction' },
  { grade: 'C3', min: 80, max: 84, points: 3, remark: 'Credit' },
  { grade: 'C4', min: 75, max: 79, points: 4, remark: 'Credit' },
  { grade: 'C5', min: 70, max: 74, points: 5, remark: 'Credit' },
  { grade: 'C6', min: 65, max: 69, points: 6, remark: 'Credit' },
  { grade: 'P7', min: 60, max: 64, points: 7, remark: 'Pass' },
  { grade: 'P8', min: 50, max: 59, points: 8, remark: 'Pass' },
  { grade: 'F9', min: 0, max: 49, points: 9, remark: 'Fail' },
];

function clampPercent(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function normalizeGradingScale(rows: Partial<GradingScaleRow>[] | unknown): GradingScaleRow[] {
  const source = Array.isArray(rows) && rows.length > 0 ? rows : DEFAULT_GRADING_SCALE;
  const normalized = source
    .map((row, index) => {
      const min = clampPercent((row as Partial<GradingScaleRow>).min);
      const max = clampPercent((row as Partial<GradingScaleRow>).max);
      return {
        grade: String((row as Partial<GradingScaleRow>).grade || '').trim() || `G${index + 1}`,
        min: Math.min(min, max),
        max: Math.max(min, max),
        points: Number((row as Partial<GradingScaleRow>).points || index + 1),
        remark: String((row as Partial<GradingScaleRow>).remark || '').trim(),
      };
    })
    .filter(row => row.grade);

  return (normalized.length > 0 ? normalized : DEFAULT_GRADING_SCALE)
    .sort((a, b) => b.min - a.min || b.max - a.max);
}

export function getSavedGradingScale(settingsRows: any[]): GradingScaleRow[] {
  const map = (settingsRows || []).reduce((acc: Record<string, string>, row: any) => {
    acc[row.key] = row.value;
    return acc;
  }, {});
  try {
    return normalizeGradingScale(map.customGradingScale ? JSON.parse(map.customGradingScale) : DEFAULT_GRADING_SCALE);
  } catch {
    return DEFAULT_GRADING_SCALE;
  }
}

export function getGradeFromScale(score: number, scale: GradingScaleRow[]) {
  const pct = clampPercent(score);
  const entry = normalizeGradingScale(scale).find(row => pct >= row.min && pct <= row.max);
  return entry || normalizeGradingScale(scale).at(-1) || DEFAULT_GRADING_SCALE.at(-1)!;
}
