import { Loader2 } from 'lucide-react';

interface LargeDataSpinnerProps {
  label?: string;
  detail?: string;
  compact?: boolean;
}

export function LargeDataSpinner({
  label = 'Loading records...',
  detail = 'Preparing large data safely.',
  compact = false,
}: LargeDataSpinnerProps) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? 'gap-2 py-6' : 'gap-3 py-12'}`}>
      <div className="relative">
        <div className="h-12 w-12 rounded-full border-4 border-primary-100 dark:border-slate-700" />
        <Loader2 className="absolute inset-0 m-auto h-7 w-7 animate-spin text-primary-600 dark:text-primary-400" />
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</p>
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{detail}</p>
      </div>
    </div>
  );
}
