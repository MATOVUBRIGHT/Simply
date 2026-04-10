import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, RotateCcw, Trash, ArrowLeft, Check, Search } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { dataService } from '../lib/database/DataService';
import { useToast } from '../contexts/ToastContext';
import { getRecycleBin, removeFromRecycleBin, clearRecycleBin, DeletedItem } from '../utils/recycleBin';

function getStoreName(type: string): string | null {
  switch (type) {
    case 'student': return 'students';
    case 'staff': return 'staff';
    case 'announcement': return 'announcements';
    case 'class': return 'classes';
    case 'subject': return 'subjects';
    case 'fee': return 'fees';
    case 'exam': return 'exams';
    case 'transport': return 'transportRoutes';
    default: return null;
  }
}

export default function RecycleBin() {
  const { user, schoolId } = useAuth();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [deletedItems, setDeletedItems] = useState<DeletedItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('');

  useEffect(() => {
    const id = schoolId || user?.id;
    if (id) {
      const items = getRecycleBin(id);
      setDeletedItems(items);
    }
  }, [user?.id, schoolId]);

  const loadDeletedItems = () => {
    const id = schoolId || user?.id;
    if (id) {
      const items = getRecycleBin(id);
      setDeletedItems(items);
    }
  };

  async function restoreItem(id: string) {
    const authId = schoolId || user?.id;
    if (!authId) return;
    const item = deletedItems.find(i => i.id === id);
    if (!item) return;

    try {
      const storeName = getStoreName(item.type);
      if (storeName) {
        await dataService.create(authId, storeName, item.data as any);
      }
      removeFromRecycleBin(authId, id);
      loadDeletedItems();
      setSelectedItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
      addToast(`${item.type.charAt(0).toUpperCase() + item.type.slice(1)} restored successfully`, 'success');
    } catch (error) {
      addToast(`Failed to restore ${item.type}`, 'error');
    }
  }

  function permanentlyDeleteItem(id: string) {
    const authId = schoolId || user?.id;
    if (!authId) return;
    const item = deletedItems.find(i => i.id === id);
    if (!item) return;

    removeFromRecycleBin(authId, id);
    loadDeletedItems();
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      newSet.delete(id);
      return newSet;
    });
    addToast(`${item.type.charAt(0).toUpperCase() + item.type.slice(1)} permanently deleted`, 'success');
  }

  function restoreSelected() {
    selectedItems.forEach(id => restoreItem(id));
  }

  function deleteSelected() {
    const authId = schoolId || user?.id;
    if (!authId) return;
    if (confirm(`Are you sure you want to permanently delete ${selectedItems.size} item(s)?`)) {
      selectedItems.forEach(id => permanentlyDeleteItem(id));
    }
  }

  function emptyBin() {
    const authId = schoolId || user?.id;
    if (!authId) return;
    if (confirm('Are you sure you want to permanently delete all items in the recycle bin? This action cannot be undone.')) {
      clearRecycleBin(authId);
      setDeletedItems([]);
      setSelectedItems(new Set());
      addToast('Recycle bin emptied', 'success');
    }
  }

  function toggleSelect(id: string) {
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }

  function selectAll() {
    if (selectedItems.size === filteredItems.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(filteredItems.map(i => i.id)));
    }
  }

  const filteredItems = deletedItems.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase());
    const matchesType = !filterType || item.type === filterType;
    return matchesSearch && matchesType;
  });

  const formatDeletedDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'student': return 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300';
      case 'staff': return 'bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300';
      case 'announcement': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300';
      case 'class': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300';
      case 'subject': return 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300';
      case 'fee': return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300';
      case 'exam': return 'bg-pink-100 text-pink-700 dark:bg-pink-900/50 dark:text-pink-300';
      default: return 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300';
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} className="text-slate-600 dark:text-slate-400" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Recycle Bin</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {deletedItems.length} item{deletedItems.length !== 1 ? 's' : ''} in recycle bin
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {selectedItems.size > 0 && (
            <>
              <button
                onClick={restoreSelected}
                className="btn btn-secondary flex items-center gap-2"
              >
                <RotateCcw size={16} />
                Restore ({selectedItems.size})
              </button>
              <button
                onClick={deleteSelected}
                className="btn bg-red-500 text-white hover:bg-red-600 flex items-center gap-2"
              >
                <Trash size={16} />
                Delete ({selectedItems.size})
              </button>
            </>
          )}
          {deletedItems.length > 0 && (
            <button
              onClick={emptyBin}
              className="btn bg-slate-600 text-white hover:bg-slate-700 flex items-center gap-2"
            >
              <Trash2 size={16} />
              Empty Bin
            </button>
          )}
        </div>
      </div>

      <div className="card">
        <div className="p-4 border-b border-slate-100 dark:border-slate-700">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search size={18} className="search-input-icon" />
              <input
                type="text"
                placeholder="Search deleted items..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="search-input"
              />
            </div>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="form-input w-full sm:w-48"
            >
              <option value="">All Types</option>
              <option value="student">Students</option>
              <option value="staff">Staff</option>
              <option value="announcement">Announcements</option>
              <option value="class">Classes</option>
              <option value="subject">Subjects</option>
              <option value="fee">Fees</option>
              <option value="exam">Exams</option>
              <option value="transport">Transport</option>
            </select>
          </div>
        </div>

        {filteredItems.length === 0 ? (
          <div className="py-20 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
              <Trash2 size={32} className="text-slate-400 dark:text-slate-600" />
            </div>
            <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">
              {search || filterType ? 'No matching items' : 'Recycle bin is empty'}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {search || filterType
                ? 'Try adjusting your search or filter'
                : 'Deleted items will appear here for 30 days'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {filteredItems.map(item => (
              <div
                key={item.id}
                className={`p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${
                  selectedItems.has(item.id) ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''
                }`}
              >
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => toggleSelect(item.id)}
                    className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-colors shrink-0 ${
                      selectedItems.has(item.id)
                        ? 'bg-indigo-600 border-indigo-600'
                        : 'border-slate-300 dark:border-slate-600 hover:border-indigo-400'
                    }`}
                  >
                    {selectedItems.has(item.id) && <Check size={14} className="text-white" />}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <h4 className="font-medium text-slate-800 dark:text-white truncate">
                        {item.name}
                      </h4>
                      <span className={`px-2.5 py-1 rounded text-xs font-semibold capitalize ${getTypeColor(item.type)}`}>
                        {item.type}
                      </span>
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                      Deleted {formatDeletedDate(item.deletedAt)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => restoreItem(item.id)}
                      className="p-2 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-lg transition-colors"
                      title="Restore"
                    >
                      <RotateCcw size={18} />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('Permanently delete this item? This cannot be undone.')) {
                          permanentlyDeleteItem(item.id);
                        }
                      }}
                      className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg transition-colors"
                      title="Delete permanently"
                    >
                      <Trash size={18} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {filteredItems.length > 0 && (
          <div className="p-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
            <div className="flex items-center justify-between">
              <button
                onClick={selectAll}
                className="text-sm text-slate-600 dark:text-slate-400 font-medium hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors flex items-center gap-2"
              >
                <Check size={16} />
                {selectedItems.size === filteredItems.length ? 'Deselect all' : 'Select all'}
              </button>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Items are automatically deleted after 30 days
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
