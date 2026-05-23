export type BoardingStatus = 'day' | 'boarding';

export function getBoardingStatus(student: any): BoardingStatus {
  const direct = String(student?.boardingStatus || '').toLowerCase();
  if (direct === 'boarding' || direct === 'day') return direct;

  const custom = Array.isArray(student?.customFields) ? student.customFields : [];
  const saved = custom.find((field: any) => {
    const key = String(field?.id || field?.label || '').toLowerCase().replace(/\s+/g, '');
    return key === 'boardingstatus' || key === 'dayboarding' || key === 'studenttype';
  });
  const value = String(saved?.value || '').toLowerCase();
  if (value === 'boarding' || value === 'day') return value;

  return Number(student?.boardingFee || 0) > 0 ? 'boarding' : 'day';
}

export function withBoardingStatus<T extends { customFields?: any[] }>(data: T, status: BoardingStatus): T & { boardingStatus: BoardingStatus } {
  const customFields = Array.isArray(data.customFields) ? data.customFields : [];
  const existing = customFields.find((field: any) => field?.id === 'boardingStatus' || field?.label === 'Boarding Status');
  const nextCustomFields = existing
    ? customFields.map((field: any) => field === existing ? { ...field, id: 'boardingStatus', label: 'Boarding Status', value: status } : field)
    : [...customFields, { id: 'boardingStatus', label: 'Boarding Status', value: status }];

  return { ...data, boardingStatus: status, customFields: nextCustomFields };
}
