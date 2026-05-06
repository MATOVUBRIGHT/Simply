import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Plus, Megaphone, Clock, Trash2, AlertCircle, CheckCircle, Info, Bell, Pin, Edit2, X, Download, FileText, ChevronDown, Check, Trash, Search } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { Announcement, Priority } from '@schofy/shared';
import { v4 as uuidv4 } from 'uuid';
import { exportToCSV, exportToPDF, exportToExcel } from '../utils/export';
import { useAuth } from '../contexts/AuthContext';
import { dataService } from '../lib/database/SupabaseDataService';
import { addToRecycleBin } from '../utils/recycleBin';
import { useTableData } from '../lib/store';
import { useConfirm } from '../components/ConfirmModal';

const priorityConfig: Record<string, { 
  bg: string; 
  text: string; 
  border: string;
  icon: any;
  gradient: string;
  gradientText: string;
}> = {
  low: { 
    bg: 'bg-slate-50 dark:bg-slate-800/50', 
    text: 'text-slate-600 dark:text-slate-400', 
    border: 'border-slate-200 dark:border-slate-700',
    icon: Info,
    gradient: 'from-slate-400 to-gray-400',
    gradientText: 'from-slate-600 to-gray-600',
  },
  medium: { 
    bg: 'bg-sky-50 dark:bg-sky-900/20', 
    text: 'text-sky-600 dark:text-sky-400', 
    border: 'border-sky-200 dark:border-sky-800',
    icon: CheckCircle,
    gradient: 'from-sky-400 to-blue-400',
    gradientText: 'from-sky-600 to-blue-600',
  },
  high: { 
    bg: 'bg-amber-50 dark:bg-amber-900/20', 
    text: 'text-amber-600 dark:text-amber-400', 
    border: 'border-amber-200 dark:border-amber-800',
    icon: AlertCircle,
    gradient: 'from-amber-400 to-orange-400',
    gradientText: 'from-amber-600 to-orange-600',
  },
  urgent: { 
    bg: 'bg-red-50 dark:bg-red-900/20', 
    text: 'text-red-600 dark:text-red-400', 
    border: 'border-red-200 dark:border-red-800',
    icon: AlertCircle,
    gradient: 'from-red-500 to-rose-500',
    gradientText: 'from-red-600 to-rose-600',
  },
};

export default function Announcements() {
  const { user, schoolId } = useAuth();
  const sid = schoolId || user?.id || '';
  const confirm = useConfirm();
  const { data: rawAnnouncements, loading } = useTableData(sid, 'announcements');
  const announcements = useMemo(() =>
    [...rawAnnouncements].sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()),
    [rawAnnouncements]
  ) as Announcement[];

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ title: '', content: '', priority: Priority.MEDIUM, eventDate: '' });
  const { addToast } = useToast();
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const [selectedAnnouncements, setSelectedAnnouncements] = useState<Set<string>>(new Set());
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  const clickTimeoutRef = useRef<number | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const submittingRef = useRef(false);

  function handleEdit(announcement: Announcement) {
    setEditingId(announcement.id);
    setFormData({
      title: announcement.title,
      content: announcement.content,
      priority: announcement.priority as Priority,
      eventDate: (announcement as any).eventDate || '',
    });
    setShowForm(true);
  }

  function handleCancelEdit() {
    setEditingId(null);
    setShowForm(false);
    setFormData({ title: '', content: '', priority: Priority.MEDIUM, eventDate: '' });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const id = schoolId || user?.id;
    if (!id || submittingRef.current) return;
    submittingRef.current = true;

    if (editingId) {
      const updated: Announcement = {
        id: editingId,
        title: formData.title,
        content: formData.content,
        priority: formData.priority,
        createdBy: 'admin',
        createdAt: announcements.find(a => a.id === editingId)?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...(formData.eventDate ? { eventDate: formData.eventDate } : {}),
      } as any;
      addToast('Announcement updated', 'success');
      handleCancelEdit();
      const result = await dataService.update(id, 'announcements', editingId, updated as any);
      if (!result.success) {
        // Rollback
        addToast('Failed to update: ' + result.error, 'error');
      }
    } else {
      const newAnnouncement: Announcement = {
        id: uuidv4(),
        ...formData,
        createdBy: 'admin',
        createdAt: new Date().toISOString(),
        ...(formData.eventDate ? { eventDate: formData.eventDate } : {}),
      } as any;
      addToast('Announcement published', 'success');
      handleCancelEdit();
      const result = await dataService.create(id, 'announcements', newAnnouncement as any);
      if (!result.success) {
        // Rollback
        addToast('Failed to publish: ' + result.error, 'error');
      }
    }
    submittingRef.current = false;
  }

  async function handleDelete(idAnnouncement: string) {
    const id = schoolId || user?.id;
    if (!id) return;
    const ok = await confirm({ title: 'Delete Announcement', description: 'Move this announcement to the recycle bin?', confirmLabel: 'Delete', variant: 'danger' });
    if (!ok) return;
    const announcement = announcements.find(a => a.id === idAnnouncement);
    // Optimistic remove
    addToast('Announcement moved to recycle bin', 'success');
    if (announcement) {
      addToRecycleBin(id, { id: `announcement-${Date.now()}`, type: 'announcement', name: announcement.title, data: announcement, deletedAt: new Date().toISOString() });
    }
    const result = await dataService.delete(id, 'announcements', idAnnouncement);
    if (!result.success) {
      addToast('Failed to delete: ' + result.error, 'error');
    }
  }

  function handleRowClick(announcementId: string) {
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
      if (lastClickedId === announcementId) {
        setSelectMode(true);
        setSelectedAnnouncements(prev => {
          const newSet = new Set(prev);
          newSet.add(announcementId);
          return newSet;
        });
      } else {
        setSelectedAnnouncements(prev => {
          const newSet = new Set(prev);
          if (newSet.has(announcementId)) {
            newSet.delete(announcementId);
          } else {
            newSet.add(announcementId);
          }
          return newSet;
        });
      }
      setLastClickedId(null);
    } else {
      setLastClickedId(announcementId);
      clickTimeoutRef.current = window.setTimeout(() => {
        if (!selectMode) {
          setLastClickedId(null);
        }
        clickTimeoutRef.current = null;
      }, 300);
    }
  }

  function handleSelectAll() {
    if (selectedAnnouncements.size === filteredAnnouncements.length) {
      setSelectedAnnouncements(new Set());
    } else {
      setSelectedAnnouncements(new Set(filteredAnnouncements.map(a => a.id)));
    }
  }

  async function handleBulkDelete() {
    const id = schoolId || user?.id;
    if (selectedAnnouncements.size === 0) return;
    const ok = await confirm({ title: `Delete ${selectedAnnouncements.size} Announcement(s)`, description: `Move ${selectedAnnouncements.size} announcement(s) to the recycle bin?`, confirmLabel: 'Delete All', variant: 'danger' });
    if (!ok || !id) return;
    
    try {
      const now = new Date().toISOString();
      
      for (const idAnnouncement of selectedAnnouncements) {
        const announcement = announcements.find(a => a.id === idAnnouncement);
        if (announcement) {
          await dataService.delete(id, 'announcements', idAnnouncement);
          addToRecycleBin(id, {
            id: `announcement-${Date.now()}-${Math.random()}`,
            type: 'announcement',
            name: announcement.title,
            data: announcement,
            deletedAt: now
          });
        }
      }
      setSelectedAnnouncements(new Set());
      setSelectMode(false);
      addToast(`${selectedAnnouncements.size} announcements moved to recycle bin`, 'success');
    } catch (error) {
      addToast('Failed to delete announcements', 'error');
    }
  }

  const urgentCount = announcements.filter(a => a.priority === Priority.URGENT || a.priority === Priority.HIGH).length;

  const filteredAnnouncements = announcements.filter(a => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return a.title.toLowerCase().includes(search) || a.content.toLowerCase().includes(search);
  });

  const announcementCSVColumns = [
    { key: 'title' as keyof Announcement, label: 'Title' },
    { key: 'content' as keyof Announcement, label: 'Content' },
    { key: 'priority' as keyof Announcement, label: 'Priority' },
    { key: 'createdBy' as keyof Announcement, label: 'Created By' },
    { key: 'createdAt' as keyof Announcement, label: 'Created At' },
  ];

  const announcementPDFColumns = [
    { key: 'title', label: 'Title' },
    { key: 'priority', label: 'Priority' },
    { key: 'createdBy', label: 'By' },
    { key: 'createdAt', label: 'Date' },
  ];

  function handleExportCSV() {
    exportToCSV(announcements, 'announcements', announcementCSVColumns);
    addToast('Announcements exported to CSV', 'success');
  }

  function handleExportPDF() {
    exportToPDF('Announcements Report', announcements, announcementPDFColumns, 'announcements');
    addToast('Announcements exported to PDF', 'success');
    setShowExportMenu(false);
  }

  function handleExportExcel() {
    exportToExcel(announcements, 'announcements', announcementCSVColumns);
    addToast('Announcements exported to Excel', 'success');
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">
            Announcements
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">School-wide announcements and notifications</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative" ref={exportMenuRef}>
            <button onClick={() => setShowExportMenu(!showExportMenu)} className="btn btn-secondary" title="Export">
              <Download size={16} />
              <span className="hidden sm:inline">Export</span>
              <ChevronDown size={14} className={`transition-transform ${showExportMenu ? 'rotate-180' : ''}`} />
            </button>
            {showExportMenu && (
              <div className="absolute right-0 mt-2 w-40 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-50 overflow-hidden">
                <button onClick={handleExportPDF} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                  <FileText size={14} /> Export PDF
                </button>
                <button onClick={handleExportCSV} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                  <Download size={14} /> Export CSV
                </button>
                <button onClick={handleExportExcel} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                  <FileText size={14} /> Export Excel
                </button>
              </div>
            )}
          </div>
          <button onClick={() => { setShowForm(true); setEditingId(null); setFormData({ title: '', content: '', priority: Priority.MEDIUM, eventDate: '' }); }} className="btn btn-primary shadow-lg shadow-primary-500/25">
            <Plus size={18} /> New Announcement
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card-solid-purple p-5 rounded-2xl shadow-lg hover:shadow-xl transition-all">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
              <Megaphone size={24} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-medium text-white/80">Total</p>
              <p className="text-2xl font-bold text-white">{announcements.length}</p>
            </div>
          </div>
        </div>
        <div className="card-solid-rose p-5 rounded-2xl shadow-lg hover:shadow-xl transition-all">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
              <AlertCircle size={24} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-medium text-white/80">High Priority</p>
              <p className="text-2xl font-bold text-white">{urgentCount}</p>
            </div>
          </div>
        </div>
        <div className="card-solid-indigo p-5 rounded-2xl shadow-lg hover:shadow-xl transition-all">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
              <Bell size={24} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-medium text-white/80">Latest</p>
              <p className="text-xl font-bold text-white">
                {announcements[0] ? new Date(announcements[0].createdAt).toLocaleDateString() : 'None'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }} onClick={e => { if (e.target === e.currentTarget) handleCancelEdit(); }}>
          <div className="w-full max-w-lg animate-modal-in" style={{ background: '#fff', borderRadius: '20px', boxShadow: '0 20px 60px rgba(0,0,0,0.12), 0 4px 20px rgba(0,0,0,0.07)', border: '1px solid rgba(0,0,0,0.05)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <div className="p-7">
              <div className="flex items-start gap-4 mb-6">
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style={{ background: '#EEF2FF' }}>
                  {editingId ? <Edit2 size={20} className="text-indigo-600" /> : <Megaphone size={20} className="text-indigo-600" />}
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <h3 className="font-bold text-slate-900 text-[17px] leading-snug">{editingId ? 'Edit Announcement' : 'Create Announcement'}</h3>
                  <p className="text-[14px] text-slate-500 mt-1">{editingId ? 'Update the announcement details.' : 'Publish a new announcement to the school.'}</p>
                </div>
                <button onClick={handleCancelEdit} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors shrink-0">
                  <X size={16} className="text-slate-400" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label className="form-label">Title</label>
                  <input value={formData.title} onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))} className="form-input" required placeholder="Enter announcement title" />
                </div>
                <div className="space-y-2">
                  <label className="form-label">Content</label>
                  <textarea value={formData.content} onChange={e => setFormData(prev => ({ ...prev, content: e.target.value }))} className="form-input" rows={4} required placeholder="Write your announcement..." />
                </div>
                <div className="space-y-2">
                  <label className="form-label">Priority</label>
                  <select value={formData.priority} onChange={e => setFormData(prev => ({ ...prev, priority: e.target.value as Priority }))} className="form-input">
                    <option value={Priority.LOW}>Low - General info</option>
                    <option value={Priority.MEDIUM}>Medium - Important</option>
                    <option value={Priority.HIGH}>High - Urgent attention</option>
                    <option value={Priority.URGENT}>Urgent - Immediate action</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="form-label">Event Date <span className="text-slate-400 font-normal text-xs">(optional — shows on calendar)</span></label>
                  <input type="date" value={formData.eventDate} onChange={e => setFormData(prev => ({ ...prev, eventDate: e.target.value }))} className="form-input" />
                </div>
                <div className="flex gap-3 justify-end pt-2">
                  <button type="button" onClick={handleCancelEdit} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-700 transition-all duration-150 hover:scale-[1.02] active:scale-[0.98]" style={{ background: '#F3F4F6' }} onMouseEnter={e => (e.currentTarget.style.background = '#E5E7EB')} onMouseLeave={e => (e.currentTarget.style.background = '#F3F4F6')}>Cancel</button>
                  <button type="submit" className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all duration-150 hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2" style={{ backgroundColor: 'var(--primary-color)', boxShadow: '0 2px 8px rgba(79,70,229,0.3)' }}>
                    {editingId ? 'Update' : 'Publish'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="p-4">
          <div className="relative">
            <Search size={18} className="search-input-icon" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search announcements..."
              className="search-input"
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {loading ? (
          <div className="card p-12 text-center">
            <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin mx-auto"></div>
            <p className="text-slate-500 mt-4">Loading announcements...</p>
          </div>
        ) : filteredAnnouncements.length === 0 ? (
          <div className="card p-12 text-center border-2 border-dashed border-slate-200 dark:border-slate-700">
            <div className="w-20 h-20 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center mx-auto">
              <Megaphone size={40} className="text-violet-400" />
            </div>
            <p className="text-slate-500 font-medium mt-4">{searchTerm ? 'No announcements found' : 'No announcements yet'}</p>
            <p className="text-slate-400 text-sm mt-1">{searchTerm ? 'Try a different search term' : 'Create your first announcement to notify everyone'}</p>
            {!searchTerm && (
              <button onClick={() => { setShowForm(true); setEditingId(null); setFormData({ title: '', content: '', priority: Priority.MEDIUM, eventDate: '' }); }} className="btn btn-primary mt-4">
                <Plus size={16} /> Create Announcement
              </button>
            )}
          </div>
        ) : filteredAnnouncements.map((a, index) => {
          const styles = priorityConfig[a.priority];
          const Icon = styles.icon;
          const isSelected = selectedAnnouncements.has(a.id);
          return (
            <div 
              key={a.id} 
              className={`card border-l-4 ${styles.border} ${styles.bg} cursor-pointer transition-all ${isSelected ? 'ring-2 ring-indigo-500 dark:ring-indigo-400' : ''}`}
              style={{ animationDelay: `${index * 50}ms` }}
              onClick={() => handleRowClick(a.id)}
              onDoubleClick={() => handleEdit(a)}
            >
              <div className="p-5">
                <div className="flex items-start gap-4">
                  {selectMode && (
                    <div className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-colors mt-1 ${
                      isSelected 
                        ? 'bg-primary-600 border-primary-600' 
                        : 'border-slate-300 dark:border-slate-600'
                    }`}>
                      {isSelected && <Check size={12} className="text-white" />}
                    </div>
                  )}
                  {!selectMode && (
                    <span className="w-6 h-6 rounded bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-xs font-medium text-slate-400 mt-1">
                      {index + 1}
                    </span>
                  )}
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${styles.gradient} flex items-center justify-center shadow-lg`}>
                    <Icon size={22} className="text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className={`text-lg font-bold bg-gradient-to-r ${styles.gradientText} bg-clip-text text-transparent`}>
                            {a.title}
                          </h3>
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold capitalize ${
                            a.priority === 'urgent' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' :
                            a.priority === 'high' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' :
                            a.priority === 'medium' ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300' :
                            'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                          }`}>
                            <Pin size={10} />
                            {a.priority}
                          </span>
                        </div>
                        <p className="text-slate-600 dark:text-slate-300 leading-relaxed">{a.content}</p>
                      </div>
                      {!selectMode && (
                        <div className="flex items-center gap-1">
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleEdit(a); }} 
                            className="p-2 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 text-indigo-600 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Edit2 size={18} />
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleDelete(a.id); }} 
                            className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-4 text-sm text-slate-500">
                      <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/50 dark:bg-slate-800/50">
                        <Clock size={14} />
                        {new Date(a.createdAt).toLocaleString('en-US', { 
                          month: 'short', 
                          day: 'numeric',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                      {(a as any).eventDate && (
                        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 text-xs font-medium">
                          📅 Event: {new Date((a as any).eventDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      )}
                      <span className="flex items-center gap-1.5">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-400 to-purple-400 flex items-center justify-center">
                          <span className="text-[10px] font-bold text-white">A</span>
                        </div>
                        by Admin
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {selectMode && selectedAnnouncements.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 bg-slate-900 dark:bg-slate-700 rounded-2xl shadow-xl animate-notif-in">
          <span className="text-sm text-white font-medium">
            {selectedAnnouncements.size} selected
          </span>
          <div className="w-px h-6 bg-slate-600"></div>
          <button
            onClick={handleSelectAll}
            className="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
          >
            {selectedAnnouncements.size === filteredAnnouncements.length ? 'Deselect All' : 'Select All'}
          </button>
          <button
            onClick={handleBulkDelete}
            className="px-3 py-1.5 text-xs bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors flex items-center gap-1"
          >
            <Trash size={14} />
            Delete
          </button>
          <button
            onClick={() => { setSelectedAnnouncements(new Set()); setSelectMode(false); }}
            className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

