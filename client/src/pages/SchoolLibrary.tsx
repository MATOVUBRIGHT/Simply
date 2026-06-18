import { useMemo, useState } from 'react';
import { BookMarked, BookOpenCheck, LibraryBig, Plus, RotateCcw, Search, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useActiveStudents } from '../contexts/StudentsContext';
import { useToast } from '../contexts/ToastContext';
import { PortalSelect } from '../components/PortalSelect';

type LibraryBook = {
  id: string;
  title: string;
  author: string;
  category: string;
  copies: number;
  issuedTo: string;
  dueDate: string;
};

const categories = ['Textbook', 'Reader', 'Reference', 'Novel', 'Teacher Guide', 'Other'];

export default function SchoolLibrary() {
  const { user, schoolId } = useAuth();
  const tenantId = schoolId || user?.id || 'local';
  const storageKey = `schofy_school_library_${tenantId}`;
  const students = useActiveStudents();
  const { addToast } = useToast();
  const [books, setBooks] = useState<LibraryBook[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || '[]');
    } catch {
      return [];
    }
  });
  const [query, setQuery] = useState('');
  const [form, setForm] = useState({
    title: '',
    author: '',
    category: 'Textbook',
    copies: '1',
    issuedTo: '',
    dueDate: '',
  });

  const issuedBooks = books.filter(book => book.issuedTo);
  const availableCopies = books.reduce((sum, book) => sum + Math.max(0, Number(book.copies || 0) - (book.issuedTo ? 1 : 0)), 0);
  const filteredBooks = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return books;
    return books.filter(book =>
      [book.title, book.author, book.category, book.issuedTo].some(value => value.toLowerCase().includes(needle))
    );
  }, [books, query]);

  function persist(next: LibraryBook[]) {
    setBooks(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  }

  function addBook() {
    if (!form.title.trim()) {
      addToast('Enter a book title', 'error');
      return;
    }
    const next: LibraryBook = {
      id: crypto.randomUUID(),
      title: form.title.trim(),
      author: form.author.trim(),
      category: form.category,
      copies: Math.max(1, Number(form.copies || 1)),
      issuedTo: form.issuedTo.trim(),
      dueDate: form.dueDate,
    };
    persist([next, ...books]);
    setForm({ title: '', author: '', category: 'Textbook', copies: '1', issuedTo: '', dueDate: '' });
    addToast('Library book added', 'success');
  }

  function updateBook(id: string, patch: Partial<LibraryBook>) {
    persist(books.map(book => book.id === id ? { ...book, ...patch } : book));
  }

  function removeBook(id: string) {
    persist(books.filter(book => book.id !== id));
  }

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div className="page-title">
          <h1 className="text-title">School Library</h1>
          <p className="text-subtitle">Book stock, issues, returns, and due dates</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card-solid-indigo p-5 rounded-2xl shadow-lg hover:shadow-xl transition-all">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-white/80">Total Books</p>
            <LibraryBig size={23} />
          </div>
          <p className="mt-3 text-3xl font-black">{books.length}</p>
        </div>
        <div className="card-solid-emerald p-5 rounded-2xl shadow-lg hover:shadow-xl transition-all">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-white/80">Available Copies</p>
            <BookOpenCheck size={23} />
          </div>
          <p className="mt-3 text-3xl font-black">{availableCopies}</p>
        </div>
        <div className="card-solid-amber p-5 rounded-2xl shadow-lg hover:shadow-xl transition-all">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-white/80">Issued Out</p>
            <BookMarked size={23} />
          </div>
          <p className="mt-3 text-3xl font-black">{issuedBooks.length}</p>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <div className="card p-5">
          <h2 className="mb-4 font-bold text-slate-900 dark:text-white">Add / Issue Book</h2>
          <div className="space-y-3">
            <div>
              <label className="form-label">Title</label>
              <input className="form-input" value={form.title} onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Author</label>
              <input className="form-input" value={form.author} onChange={e => setForm(prev => ({ ...prev, author: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label">Category</label>
                <PortalSelect
                  value={form.category}
                  onChange={value => setForm(prev => ({ ...prev, category: value }))}
                  options={categories.map(category => ({ value: category, label: category }))}
                  className="filter-select filter-input-active"
                />
              </div>
              <div>
                <label className="form-label">Copies</label>
                <input type="number" min="1" className="form-input" value={form.copies} onChange={e => setForm(prev => ({ ...prev, copies: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="form-label">Issued To</label>
              <input
                className="form-input"
                list="library-students"
                value={form.issuedTo}
                onChange={e => setForm(prev => ({ ...prev, issuedTo: e.target.value }))}
              />
              <datalist id="library-students">
                {students.slice(0, 400).map((student: any) => (
                  <option key={student.id} value={`${student.firstName || ''} ${student.lastName || ''}`.trim()} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="form-label">Due Date</label>
              <input type="date" className="form-input" value={form.dueDate} onChange={e => setForm(prev => ({ ...prev, dueDate: e.target.value }))} />
            </div>
            <button type="button" onClick={addBook} className="btn btn-primary w-full justify-center">
              <Plus size={16} /> Save Book
            </button>
          </div>
        </div>

        <div className="table-container overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="font-bold text-slate-900 dark:text-white">Library Register</h2>
            <div className="relative sm:w-72">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className="search-input pl-9" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search books..." />
            </div>
          </div>
          <div>
            <table>
              <thead>
                <tr><th>Book</th><th>Category</th><th>Copies</th><th>Issued To</th><th>Due</th><th>Action</th></tr>
              </thead>
              <tbody>
                {filteredBooks.length === 0 ? (
                  <tr><td colSpan={6} className="py-12 text-center text-sm font-semibold text-slate-400">No library books found</td></tr>
                ) : filteredBooks.map(book => (
                  <tr key={book.id} className="animate-slide-down bg-white transition-colors hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/50">
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                          <LibraryBig size={16} />
                        </div>
                        <div>
                          <p className="font-medium text-slate-800 dark:text-white">{book.title}</p>
                          <p className="text-xs text-slate-400">{book.author || 'Unknown author'}</p>
                        </div>
                      </div>
                    </td>
                    <td><span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">{book.category}</span></td>
                    <td>{book.copies}</td>
                    <td>
                      <input
                        className="form-input min-w-44 py-1.5 text-xs"
                        value={book.issuedTo}
                        onChange={e => updateBook(book.id, { issuedTo: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="date"
                        className="form-input min-w-36 py-1.5 text-xs"
                        value={book.dueDate}
                        onChange={e => updateBook(book.id, { dueDate: e.target.value })}
                      />
                    </td>
                    <td>
                      <div className="flex gap-2">
                        <button type="button" className="btn btn-secondary" onClick={() => updateBook(book.id, { issuedTo: '', dueDate: '' })}>
                          <RotateCcw size={14} />
                        </button>
                        <button type="button" className="btn btn-secondary text-rose-600" onClick={() => removeBook(book.id)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
