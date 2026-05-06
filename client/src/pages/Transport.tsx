import { useState, useRef, useEffect } from 'react';
import { Plus, Bus, Trash2, User, MapPin, DollarSign, Users, Download, Upload, FileText, ChevronDown, X, ArrowRight, Check } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { dataService } from '../lib/database/SupabaseDataService';
import { TransportRoute, TransportAssignment } from '@schofy/shared';
import { v4 as uuidv4 } from 'uuid';
import { useCurrency } from '../hooks/useCurrency';
import { exportToCSV, exportToPDF, exportToExcel } from '../utils/export';
import { useStudents } from '../contexts/StudentsContext';
import { addToRecycleBin } from '../utils/recycleBin';
import { useTableData } from '../lib/store';
import { useConfirm } from '../components/ConfirmModal';

export default function Transport() {
  const { user, schoolId } = useAuth();
  const sid = schoolId || user?.id || '';
  const { data: routes } = useTableData(sid, 'transportRoutes');
  const { data: assignments, loading } = useTableData(sid, 'transportAssignments');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', description: '', fee: 0 });
  const [selectedRoute, setSelectedRoute] = useState<string>('');
  const { addToast } = useToast();
  const { formatMoney } = useCurrency();
  const confirm = useConfirm();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importStep, setImportStep] = useState<'upload' | 'map' | 'preview'>('upload');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvData, setCsvData] = useState<string[][]>([]);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [importPreview, setImportPreview] = useState<Partial<TransportRoute>[]>([]);

  const { students } = useStudents();

  const transportExpectedFields = [
    { key: 'name', label: 'Route Name', required: true },
    { key: 'description', label: 'Description', required: false },
    { key: 'fee', label: 'Monthly Fee', required: true },
  ];

  async function handleAddRoute(e: React.FormEvent) {
    e.preventDefault();
    const id = schoolId || user?.id;
    if (!id) return;
    try {
      const newRoute: TransportRoute = { id: uuidv4(), ...formData, createdAt: new Date().toISOString() };
      await dataService.create(id, 'transportRoutes', newRoute as any);
      setShowForm(false);
      setFormData({ name: '', description: '', fee: 0 });
      addToast('Route added successfully', 'success');
    } catch (error) {
      addToast('Failed to add route', 'error');
    }
  }

  async function handleDelete(idRoute: string) {
    const id = schoolId || user?.id;
    if (!id) return;
    const ok = await confirm({ title: 'Delete Route', description: 'Delete this route? Students will be unassigned.', confirmLabel: 'Delete', variant: 'danger' });
    if (!ok) return;
    try {
        const route = routes.find(r => r.id === idRoute);
        const relatedAssignments = assignments.filter(a => a.routeId === idRoute);
        
        await dataService.delete(id, 'transportRoutes', idRoute);
        const routeAssignments = relatedAssignments.map(a => a.id);
        for (const assignId of routeAssignments) {
          await dataService.delete(id, 'transportAssignments', assignId);
        }
        
        if (route) {
          addToRecycleBin(id, {
            id: `transport-${Date.now()}`,
            type: 'transport',
            name: route.name,
            data: { route, assignments: relatedAssignments },
            deletedAt: new Date().toISOString()
          });
        }
        
        if (selectedRoute === idRoute) setSelectedRoute('');
        addToast('Route moved to recycle bin', 'success');
      } catch (error) {
        addToast('Failed to delete', 'error');
      }
  }

  const totalStudentsAssigned = assignments.length;
  const totalRevenue = routes.reduce((sum, route) => {
    const routeAssignments = assignments.filter(a => a.routeId === route.id).length;
    return sum + (routeAssignments * route.fee);
  }, 0);

  const routeStudents = selectedRoute ? assignments.filter(a => a.routeId === selectedRoute) : [];

  function handleExportCSV() {
    const columns = [
      { key: 'name' as keyof TransportRoute, label: 'Route Name' },
      { key: 'description' as keyof TransportRoute, label: 'Description' },
      { key: 'fee' as keyof TransportRoute, label: 'Monthly Fee' },
    ];
    exportToCSV(routes, 'transport-routes', columns);
    addToast('Exported to CSV', 'success');
  }

  function handleExportPDF() {
    const columns = [
      { key: 'name', label: 'Route Name' },
      { key: 'description', label: 'Description' },
      { key: 'fee', label: 'Monthly Fee' },
    ];
    exportToPDF('Transport Routes Report', routes, columns, 'transport-routes');
    addToast('Exported to PDF', 'success');
    setShowExportMenu(false);
  }

  function handleExportExcel() {
    const columns = [
      { key: 'name' as keyof TransportRoute, label: 'Route Name' },
      { key: 'description' as keyof TransportRoute, label: 'Description' },
      { key: 'fee' as keyof TransportRoute, label: 'Monthly Fee' },
    ];
    exportToExcel(routes, 'transport-routes', columns);
    addToast('Exported to Excel', 'success');
    setShowExportMenu(false);
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function downloadTemplate() {
    import('xlsx').then(({ utils, writeFile }) => {
      const headers = transportExpectedFields.map(f => f.label);
      const sampleRow = ['Route A', 'Kampala Central', '50000'];
      const ws = utils.aoa_to_sheet([headers, sampleRow]);
      ws['!cols'] = headers.map(h => ({ wch: Math.max(h.length + 4, 14) }));
      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, 'Transport');
      writeFile(wb, 'transport-route-import-template.xlsx');
      addToast('Template downloaded', 'success');
    });
  }

  function closeImportModal() {
    setShowImportModal(false);
    setImportStep('upload');
    setCsvHeaders([]);
    setCsvData([]);
    setFieldMapping({});
    setImportPreview([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      if (lines.length < 2) { addToast('CSV must have headers and at least one data row', 'error'); return; }
      const headers = parseCSVLine(lines[0]);
      const data = lines.slice(1).map(line => parseCSVLine(line));
      setCsvHeaders(headers);
      setCsvData(data);
      const autoMapping: Record<string, string> = {};
      transportExpectedFields.forEach(field => {
        const matchingHeader = headers.find(h => h.toLowerCase() === field.label.toLowerCase() || h.toLowerCase().includes(field.key.toLowerCase()));
        if (matchingHeader) autoMapping[field.key] = matchingHeader;
      });
      setFieldMapping(autoMapping);
      setImportStep('map');
      setShowImportModal(true);
    } catch (error) { addToast('Failed to read CSV file', 'error'); }
    event.target.value = '';
  }

  function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') inQuotes = !inQuotes;
      else if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
      else current += char;
    }
    result.push(current.trim());
    return result;
  }

  function processMapping() {
    const mappedData: Partial<TransportRoute>[] = [];
    for (const row of csvData) {
      const route: Partial<TransportRoute> = {};
      transportExpectedFields.forEach(field => {
        const csvHeader = fieldMapping[field.key];
        if (csvHeader) {
          const headerIndex = csvHeaders.indexOf(csvHeader);
          if (headerIndex !== -1 && row[headerIndex]) {
            if (field.key === 'fee') {
              (route as any)[field.key] = parseFloat(row[headerIndex]) || 0;
            } else {
              (route as any)[field.key] = row[headerIndex];
            }
          }
        }
      });
      if (route.name) mappedData.push(route);
    }
    setImportPreview(mappedData);
    setImportStep('preview');
  }

  async function executeImport() {
    const id = schoolId || user?.id;
    if (importPreview.length === 0) { addToast('No valid routes to import', 'error'); return; }
    if (!id) return;
    try {
      const now = new Date().toISOString();
      let successCount = 0;
      for (const data of importPreview) {
        const route: TransportRoute = {
          id: uuidv4(),
          name: (data.name as string) || 'Unknown',
          description: (data.description as string) || '',
          fee: (data.fee as number) || 0,
          createdAt: now,
        };
        await dataService.create(id, 'transportRoutes', route as any);
        successCount++;
      }
      addToast(`Successfully imported ${successCount} routes`, 'success');
      closeImportModal();
    } catch (error) { addToast('Failed to import routes', 'error'); }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">
          Transport Management
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Manage school transportation and routes</p>
      </div>
        <div className="flex items-center gap-2">
          <div className="relative" ref={exportMenuRef}>
            <button 
              onClick={() => setShowExportMenu(!showExportMenu)} 
              className="btn btn-secondary"
              title="Export"
            >
              <Download size={16} />
              <span className="hidden sm:inline">Export</span>
              <ChevronDown size={14} className={`transition-transform ${showExportMenu ? 'rotate-180' : ''}`} />
            </button>
            {showExportMenu && (
              <div className="absolute right-0 mt-2 w-40 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-50 overflow-hidden">
                <button
                  onClick={handleExportPDF}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                  <FileText size={14} />
                  Export PDF
                </button>
                <button
                  onClick={handleExportCSV}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                  <Download size={14} />
                  Export CSV
                </button>
                <button
                  onClick={handleExportExcel}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                  <FileText size={14} />
                  Export Excel
                </button>
              </div>
            )}
          </div>
          <button onClick={() => { setShowImportModal(true); fileInputRef.current?.click(); }} className="btn btn-secondary" title="Import CSV">
            <Upload size={16} />
            <span className="hidden sm:inline">Import</span>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept=".xlsx,.xls,.csv"
            className="hidden"
          />
          <button onClick={() => setShowForm(true)} className="btn btn-primary shadow-lg shadow-primary-500/25">
            <Plus size={16} /> Add Route
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card-solid-indigo p-5 rounded-2xl shadow-lg hover:shadow-xl transition-all">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
              <Bus size={24} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-medium text-white/80">Bus Routes</p>
              <p className="text-2xl font-bold text-white">{routes.length}</p>
            </div>
          </div>
        </div>
        <div className="card-solid-emerald p-5 rounded-2xl shadow-lg hover:shadow-xl transition-all">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
              <Users size={24} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-medium text-white/80">Assigned Students</p>
              <p className="text-2xl font-bold text-white">{totalStudentsAssigned}</p>
            </div>
          </div>
        </div>
        <div className="card-solid-violet p-5 rounded-2xl shadow-lg hover:shadow-xl transition-all">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
              <DollarSign size={24} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-medium text-white/80">Monthly Revenue</p>
              <p className="text-2xl font-bold text-white">{formatMoney(totalRevenue)}</p>
            </div>
          </div>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={e => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-700 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700" style={{ backgroundColor: 'var(--primary-color)' }}>
              <h3 className="font-bold text-white flex items-center gap-2"><Plus size={18} /> Add New Route</h3>
              <button onClick={() => setShowForm(false)} className="p-1 hover:bg-white/20 rounded-lg transition-colors"><X size={18} className="text-white" /></button>
            </div>
            <form onSubmit={handleAddRoute} className="p-5 grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <label className="form-label">Route Name</label>
                <input value={formData.name} onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))} className="form-input" required placeholder="Route A" />
              </div>
              <div className="space-y-2">
                <label className="form-label">Description</label>
                <input value={formData.description} onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))} className="form-input" placeholder="Area covered" />
              </div>
              <div className="space-y-2">
                <label className="form-label">Monthly Fee</label>
                <input type="number" value={formData.fee} onChange={e => setFormData(prev => ({ ...prev, fee: parseFloat(e.target.value) }))} className="form-input" />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="submit" className="btn btn-primary flex-1">Save Route</button>
                <button type="button" onClick={() => setShowForm(false)} className="btn btn-secondary">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="card-header bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-400 to-purple-400 flex items-center justify-center shadow-md">
                <Bus size={20} className="text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-800 dark:text-white">Bus Routes</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">{routes.length} routes configured</p>
              </div>
            </div>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
            {loading ? (
              <div className="p-8 text-center">
                <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin mx-auto"></div>
                <p className="text-slate-500 mt-3">Loading...</p>
              </div>
            ) : routes.length === 0 ? (
              <div className="p-8 text-center">
                <div className="w-16 h-16 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center mx-auto">
                  <Bus size={32} className="text-violet-400" />
                </div>
                <p className="text-slate-500 font-medium mt-3">No routes yet</p>
                <button onClick={() => setShowForm(true)} className="text-primary-500 hover:text-primary-600 text-sm mt-2">
                  Add your first route
                </button>
              </div>
            ) : routes.map(route => {
              const assignedCount = assignments.filter(a => a.routeId === route.id).length;
              return (
                <div key={route.id} className="p-5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-sky-400 to-blue-400 flex items-center justify-center shadow-md">
                        <Bus size={24} className="text-white" />
                      </div>
                      <div>
                        <p className="font-bold text-lg text-slate-800 dark:text-white">{route.name}</p>
                        <p className="text-sm text-slate-500 mt-1 flex items-center gap-1">
                          <MapPin size={14} />
                          {route.description || 'No description'}
                        </p>
                        <div className="flex items-center gap-3 mt-2">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                            <Users size={12} />
                            {assignedCount} students
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-100 to-yellow-100 text-amber-700 dark:from-amber-900/40 dark:to-yellow-900/40 dark:text-amber-300 font-bold text-sm">
                        {formatMoney(route.fee)}/mo
                      </span>
                      <button 
                        onClick={() => handleDelete(route.id)} 
                        className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 rounded-lg transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <div className="card-header bg-gradient-to-r from-teal-50 to-cyan-50 dark:from-teal-900/20 dark:to-cyan-900/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-400 to-cyan-400 flex items-center justify-center shadow-md">
                <Users size={20} className="text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-800 dark:text-white">Students by Route</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">View assigned students</p>
              </div>
            </div>
          </div>
          <div className="p-5">
            <select 
              value={selectedRoute} 
              onChange={e => setSelectedRoute(e.target.value)} 
              className="form-input mb-5"
            >
              <option value="">Select a route to view students</option>
              {routes.map(r => (
                <option key={r.id} value={r.id}>{r.name} - {formatMoney(r.fee)}/month</option>
              ))}
            </select>
            
            {selectedRoute ? (
              routeStudents.length > 0 ? (
                <div className="space-y-3">
                  {routeStudents.map(a => {
                    const student = students.find(s => s.id === a.studentId);
                    const route = routes.find(r => r.id === selectedRoute);
                    return (
                      <div key={a.id} className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-700/50 border border-slate-200 dark:border-slate-700">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-400 to-cyan-400 flex items-center justify-center shadow-sm">
                            <User size={20} className="text-white" />
                          </div>
                          <div>
                            <p className="font-semibold text-slate-800 dark:text-white">
                              {student ? `${student.firstName} ${student.lastName}` : 'Unknown Student'}
                            </p>
                            <p className="text-xs text-slate-500">
                              {student?.admissionNo || 'No ID'}
                            </p>
                          </div>
                        </div>
                        <span className="text-sm font-semibold text-teal-600 dark:text-teal-400">
                          {formatMoney(route?.fee || 0)}/mo
                        </span>
                      </div>
                    );
                  })}
                  <div className="mt-4 p-4 rounded-xl bg-gradient-to-r from-teal-50 to-cyan-50 dark:from-teal-900/20 dark:to-cyan-900/20 border border-teal-200 dark:border-teal-800">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-teal-700 dark:text-teal-300">Total Monthly:</span>
                      <span className="text-lg font-bold text-teal-700 dark:text-teal-300">
                        {formatMoney(routeStudents.length * (routes.find(r => r.id === selectedRoute)?.fee || 0))}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center mx-auto">
                    <User size={32} className="text-teal-400" />
                  </div>
                  <p className="text-slate-500 font-medium mt-3">No students assigned</p>
                  <p className="text-slate-400 text-sm">Assign students to this route from their profiles</p>
                </div>
              )
            ) : (
              <div className="text-center py-8">
                <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto">
                  <MapPin size={32} className="text-slate-400" />
                </div>
                <p className="text-slate-500 font-medium mt-3">Select a route</p>
                <p className="text-slate-400 text-sm">Choose a route above to see assigned students</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {showImportModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) closeImportModal(); }}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md animate-modal-in border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700" style={{ backgroundColor: 'var(--primary-color)' }}>
              <div className="flex items-center gap-2">
                <Upload size={18} className="text-white" />
                <h2 className="font-bold text-white">Import Transport Routes</h2>
              </div>
              <button onClick={closeImportModal} className="p-1 hover:bg-white/20 rounded-lg transition-colors">
                <X size={18} className="text-white" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto max-h-[calc(85vh-56px)]">
              {importStep === 'upload' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-4">
                    <button onClick={downloadTemplate} className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 rounded-lg transition-colors text-sm font-medium">
                      <Download size={14} />
                      Download Template
                    </button>
                  </div>

                  <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-6 hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors cursor-pointer text-center"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload size={28} className="mx-auto text-slate-400 mb-2" />
                    <p className="text-sm text-slate-600 dark:text-slate-300 font-medium">Click to upload CSV file</p>
                    <p className="text-xs text-slate-400 mt-1">or drag and drop</p>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                    <h4 className="font-medium text-slate-700 dark:text-slate-200 mb-2 text-sm">Expected Fields:</h4>
                    <div className="grid grid-cols-2 gap-1.5 text-xs">
                      {transportExpectedFields.map(field => (
                        <div key={field.key} className="flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${field.required ? 'bg-red-500' : 'bg-slate-400'}`} />
                          <span className="text-slate-600 dark:text-slate-300 truncate">{field.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {importStep === 'map' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <span className="px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-300 rounded">1</span>
                    <ArrowRight size={12} />
                    <span className="px-1.5 py-0.5 bg-indigo-600 text-white rounded font-medium">2 Map</span>
                    <ArrowRight size={12} />
                    <span className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-700 text-slate-500 rounded">3</span>
                  </div>

                  <div className="max-h-64 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-700/50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">File Column</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">Sample</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">Maps To</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {csvHeaders.map((header, idx) => {
                          const sample = csvData[0]?.[idx] || '';
                          const currentMapping = Object.entries(fieldMapping).find(([, v]) => v === header)?.[0] || '';
                          return (
                            <tr key={header} className={idx % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-slate-50/50 dark:bg-slate-800/50'}>
                              <td className="px-3 py-2 font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap">{header}</td>
                              <td className="px-3 py-2 text-slate-400 truncate max-w-[80px]">{sample}</td>
                              <td className="px-3 py-2">
                                <select
                                  value={currentMapping}
                                  onChange={e => {
                                    const newKey = e.target.value;
                                    setFieldMapping(prev => {
                                      const next = { ...prev };
                                      Object.keys(next).forEach(k => { if (next[k] === header) delete next[k]; });
                                      if (newKey) next[newKey] = header;
                                      return next;
                                    });
                                  }}
                                  className="w-full form-input py-1 px-2 text-xs"
                                >
                                  <option value="">— Skip —</option>
                                  {transportExpectedFields.map(f => (
                                    <option key={f.key} value={f.key}>{f.label}{f.required ? ' *' : ''}</option>
                                  ))}
                                </select>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button onClick={closeImportModal} className="btn btn-secondary py-1.5 px-3 text-sm">Cancel</button>
                    <button onClick={processMapping} className="btn btn-primary py-1.5 px-3 text-sm flex items-center gap-1">
                      Preview <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              )}

              {importStep === 'preview' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <span className="px-1.5 py-0.5 bg-green-600 text-white rounded flex items-center gap-1"><Check size={10} /> 1</span>
                    <ArrowRight size={12} />
                    <span className="px-1.5 py-0.5 bg-green-600 text-white rounded flex items-center gap-1"><Check size={10} /> 2</span>
                    <ArrowRight size={12} />
                    <span className="px-1.5 py-0.5 bg-indigo-600 text-white rounded font-medium">3</span>
                  </div>

                  <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-2.5">
                    <p className="text-sm text-emerald-700 dark:text-emerald-300">
                      <strong>{importPreview.length}</strong> routes ready to import
                    </p>
                  </div>

                  <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-700/50 sticky top-0">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-medium text-slate-600 dark:text-slate-300">#</th>
                          <th className="px-2 py-1.5 text-left font-medium text-slate-600 dark:text-slate-300">Route</th>
                          <th className="px-2 py-1.5 text-left font-medium text-slate-600 dark:text-slate-300">Fee</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {importPreview.slice(0, 5).map((route, index) => (
                          <tr key={index} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                            <td className="px-2 py-1.5 text-slate-500">{index + 1}</td>
                            <td className="px-2 py-1.5">{(route as any).name || '-'}</td>
                            <td className="px-2 py-1.5">{formatMoney((route as any).fee || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {importPreview.length > 5 && (
                      <div className="p-2 text-center text-xs text-slate-500 bg-slate-50 dark:bg-slate-700/50">
                        ... and {importPreview.length - 5} more
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between pt-2">
                    <button onClick={() => setImportStep('map')} className="btn btn-secondary py-1.5 px-3 text-sm">Back</button>
                    <button onClick={executeImport} className="btn btn-primary py-1.5 px-3 text-sm flex items-center gap-1">
                      <Check size={14} /> Import {importPreview.length}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

