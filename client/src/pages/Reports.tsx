import { useState, useRef, useEffect } from 'react';
import { Download, Users, DollarSign, Calendar, UserCheck, BookOpen, ChevronDown, FileText } from 'lucide-react';
import { useCurrency } from '../hooks/useCurrency';
import { useToast } from '../contexts/ToastContext';
import { exportToCSV, exportToExcel } from '../utils/export';
import { useActiveStudents } from '../contexts/StudentsContext';
import { useAuth } from '../contexts/AuthContext';
import { dataService } from '../lib/database/SupabaseDataService';

type ReportType = 'students' | 'fees' | 'attendance' | 'staff' | 'classes';

export default function Reports() {
  const { user, schoolId } = useAuth();
  const [selectedReport, setSelectedReport] = useState<ReportType>('students');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const { formatMoney } = useCurrency();
  const { addToast } = useToast();
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  const students = useActiveStudents();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const reportTypes = [
    { id: 'students', label: 'Student List', icon: Users, description: 'Export all registered students' },
    { id: 'staff', label: 'Staff Directory', icon: UserCheck, description: 'Export all staff members' },
    { id: 'fees', label: 'Fee Collection', icon: DollarSign, description: 'Financial collection report' },
    { id: 'attendance', label: 'Attendance', icon: Calendar, description: 'Attendance summary report' },
    { id: 'classes', label: 'Class Summary', icon: BookOpen, description: 'Classes and enrollment report' },
  ];

  async function handleExport() {
    const id = schoolId || user?.id;
    if (!id) return;
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF();

    doc.setFontSize(20);
    doc.text('Schofy School Management', 105, 20, { align: 'center' });
    doc.setFontSize(14);
    doc.text(`${reportTypes.find(r => r.id === selectedReport)?.label || selectedReport} Report`, 105, 30, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 105, 40, { align: 'center' });
    if (dateFrom || dateTo) {
      doc.text(`Date Range: ${dateFrom || 'All'} to ${dateTo || 'All'}`, 105, 48, { align: 'center' });
    }

    if (selectedReport === 'students') {
      const studentList = students;
      
      doc.setFontSize(12);
      doc.text('Student List', 14, 55);
      
      let y = 65;
      doc.setFontSize(10);
      doc.text('Admission No.', 14, y);
      doc.text('Name', 55, y);
      doc.text('Class', 110, y);
      doc.text('Gender', 145, y);
      doc.text('Status', 170, y);
      
      y += 8;
      studentList.slice(0, 30).forEach(s => {
        doc.text(s.admissionNo, 14, y);
        doc.text(`${s.firstName} ${s.lastName}`, 55, y);
        doc.text(s.classId, 110, y);
        doc.text(s.gender, 145, y);
        doc.text(s.status, 170, y);
        y += 7;
        if (y > 270) return;
      });
      
      doc.text(`Total Students: ${studentList.length}`, 14, y + 10);
    }

    if (selectedReport === 'staff') {
      const staff = await dataService.getAll(id, 'staff');
      
      doc.setFontSize(12);
      doc.text('Staff Directory', 14, 55);
      
      let y = 65;
      doc.setFontSize(10);
      doc.text('Employee ID', 14, y);
      doc.text('Name', 55, y);
      doc.text('Role', 110, y);
      doc.text('Phone', 145, y);
      doc.text('Status', 175, y);
      
      y += 8;
      staff.slice(0, 30).forEach(s => {
        doc.text(s.employeeId, 14, y);
        doc.text(`${s.firstName} ${s.lastName}`, 55, y);
        doc.text(s.role, 110, y);
        doc.text(s.phone, 145, y);
        doc.text(s.status, 175, y);
        y += 7;
        if (y > 270) return;
      });
      
      doc.text(`Total Staff: ${staff.length}`, 14, y + 10);
    }

    if (selectedReport === 'fees') {
      const [payments, fees] = await Promise.all([dataService.getAll(id, 'payments'), dataService.getAll(id, 'fees')]);
      const studentList = students;
      const totalCollected = payments.reduce((sum, p) => sum + p.amount, 0);
      const totalInvoiced = fees.reduce((sum, f) => sum + f.amount, 0);
      const totalPending = totalInvoiced - totalCollected;
      
      doc.setFontSize(12);
      doc.text('Fee Collection Summary', 14, 55);
      doc.setFontSize(10);
      doc.text(`Total Collected: ${formatMoney(totalCollected)}`, 14, 70);
      doc.text(`Total Invoiced: ${formatMoney(totalInvoiced)}`, 14, 78);
      doc.text(`Total Pending: ${formatMoney(totalPending)}`, 14, 86);
      doc.text(`Number of Transactions: ${payments.length}`, 14, 96);
      
      let y = 110;
      doc.text('Recent Payments', 14, y);
      y += 10;
      
      doc.text('Date', 14, y);
      doc.text('Student', 55, y);
      doc.text('Amount', 140, y);
      y += 8;
      
      payments.slice(0, 20).forEach(p => {
        const student = studentList.find(s => s.id === p.studentId);
        doc.text(new Date(p.date).toLocaleDateString(), 14, y);
        doc.text(student ? `${student.firstName} ${student.lastName}` : 'N/A', 55, y);
        doc.text(formatMoney(p.amount), 140, y);
        y += 7;
        if (y > 270) return;
      });
    }

    if (selectedReport === 'attendance') {
      const attendance = await dataService.getAll(id, 'attendance');
      const studentList = students;
      
      doc.setFontSize(12);
      doc.text('Attendance Summary', 14, 55);
      doc.setFontSize(10);
      doc.text(`Total Records: ${attendance.length}`, 14, 70);
      
      const present = attendance.filter(a => a.status === 'present').length;
      const absent = attendance.filter(a => a.status === 'absent').length;
      const late = attendance.filter(a => a.status === 'late').length;
      
      doc.text(`Present: ${present}`, 14, 80);
      doc.text(`Absent: ${absent}`, 60, 80);
      doc.text(`Late: ${late}`, 100, 80);
      
      let y = 95;
      doc.text('Recent Attendance Records', 14, y);
      y += 10;
      
      doc.text('Date', 14, y);
      doc.text('Student', 55, y);
      doc.text('Status', 140, y);
      y += 8;
      
      attendance.slice(0, 25).forEach(a => {
        const student = studentList.find(s => s.id === a.entityId);
        doc.text(a.date, 14, y);
        doc.text(student ? `${student.firstName} ${student.lastName}` : 'N/A', 55, y);
        doc.text(a.status, 140, y);
        y += 7;
        if (y > 270) return;
      });
    }

    if (selectedReport === 'classes') {
      const [classes, studentList] = await Promise.all([dataService.getAll(id, 'classes'), Promise.resolve(students)]);
      
      doc.setFontSize(12);
      doc.text('Class Summary Report', 14, 55);
      
      let y = 65;
      doc.setFontSize(10);
      doc.text('Class', 14, y);
      doc.text('Level', 70, y);
      doc.text('Stream', 100, y);
      doc.text('Capacity', 140, y);
      doc.text('Enrolled', 170, y);
      
      y += 8;
      classes.forEach(c => {
        const enrolled = studentList.filter(s => s.classId === c.id).length;
        doc.text(c.name, 14, y);
        doc.text(String(c.level), 70, y);
        doc.text(c.stream || '-', 100, y);
        doc.text(String(c.capacity), 140, y);
        doc.text(String(enrolled), 170, y);
        y += 7;
        if (y > 270) return;
      });
      
      doc.text(`Total Classes: ${classes.length}`, 14, y + 10);
      doc.text(`Total Students: ${studentList.length}`, 14, y + 18);
    }

    doc.save(`${selectedReport}-report-${new Date().toISOString().split('T')[0]}.pdf`);
    addToast('Report exported to PDF', 'success');
    setShowExportMenu(false);
  }

  async function handleExportCSV() {
    const id = schoolId || user?.id;
    if (!id) return;
    const { format } = await import('date-fns');

    if (selectedReport === 'students') {
      const data = students.map(s => ({
        admissionNo: s.admissionNo,
        firstName: s.firstName,
        lastName: s.lastName,
        class: s.classId,
        gender: s.gender,
        status: s.status,
      }));
      exportToCSV(data, `${selectedReport}-report`, [
        { key: 'admissionNo', label: 'Admission No' },
        { key: 'firstName', label: 'First Name' },
        { key: 'lastName', label: 'Last Name' },
        { key: 'class', label: 'Class' },
        { key: 'gender', label: 'Gender' },
        { key: 'status', label: 'Status' },
      ]);
    } else if (selectedReport === 'staff') {
      const staff = await dataService.getAll(id, 'staff');
      const data = staff.map(s => ({
        employeeId: s.employeeId,
        firstName: s.firstName,
        lastName: s.lastName,
        role: s.role,
        phone: s.phone,
        status: s.status,
      }));
      exportToCSV(data, `${selectedReport}-report`, [
        { key: 'employeeId', label: 'Employee ID' },
        { key: 'firstName', label: 'First Name' },
        { key: 'lastName', label: 'Last Name' },
        { key: 'role', label: 'Role' },
        { key: 'phone', label: 'Phone' },
        { key: 'status', label: 'Status' },
      ]);
    } else if (selectedReport === 'fees') {
      const payments = await dataService.getAll(id, 'payments');
      const data = payments.map(p => {
        const student = students.find(s => s.id === p.studentId);
        return {
          date: format(new Date(p.date), 'yyyy-MM-dd'),
          studentName: student ? `${student.firstName} ${student.lastName}` : 'N/A',
          amount: p.amount,
          method: p.method,
        };
      });
      exportToCSV(data, `${selectedReport}-report`, [
        { key: 'date', label: 'Date' },
        { key: 'studentName', label: 'Student' },
        { key: 'amount', label: 'Amount' },
        { key: 'method', label: 'Method' },
      ]);
    } else if (selectedReport === 'attendance') {
      const attendance = await dataService.getAll(id, 'attendance');
      const data = attendance.map(a => {
        const student = students.find(s => s.id === a.entityId);
        return {
          date: a.date,
          studentName: student ? `${student.firstName} ${student.lastName}` : 'N/A',
          status: a.status,
        };
      });
      exportToCSV(data, `${selectedReport}-report`, [
        { key: 'date', label: 'Date' },
        { key: 'studentName', label: 'Student' },
        { key: 'status', label: 'Status' },
      ]);
    } else if (selectedReport === 'classes') {
      const classes = await dataService.getAll(id, 'classes');
      const data = classes.map(c => ({
        name: c.name,
        level: c.level,
        stream: c.stream || '-',
        capacity: c.capacity,
        enrolled: students.filter(s => s.classId === c.id).length,
      }));
      exportToCSV(data, `${selectedReport}-report`, [
        { key: 'name', label: 'Class' },
        { key: 'level', label: 'Level' },
        { key: 'stream', label: 'Stream' },
        { key: 'capacity', label: 'Capacity' },
        { key: 'enrolled', label: 'Enrolled' },
      ]);
    }
    addToast('Report exported to CSV', 'success');
    setShowExportMenu(false);
  }

  async function handleExportExcel() {
    const id = schoolId || user?.id;
    if (!id) return;
    const { format } = await import('date-fns');

    if (selectedReport === 'students') {
      const data = students.map(s => ({
        admissionNo: s.admissionNo,
        firstName: s.firstName,
        lastName: s.lastName,
        class: s.classId,
        gender: s.gender,
        status: s.status,
      }));
      exportToExcel(data, `${selectedReport}-report`, [
        { key: 'admissionNo', label: 'Admission No' },
        { key: 'firstName', label: 'First Name' },
        { key: 'lastName', label: 'Last Name' },
        { key: 'class', label: 'Class' },
        { key: 'gender', label: 'Gender' },
        { key: 'status', label: 'Status' },
      ]);
    } else if (selectedReport === 'staff') {
      const staff = await dataService.getAll(id, 'staff');
      const data = staff.map(s => ({
        employeeId: s.employeeId,
        firstName: s.firstName,
        lastName: s.lastName,
        role: s.role,
        phone: s.phone,
        status: s.status,
      }));
      exportToExcel(data, `${selectedReport}-report`, [
        { key: 'employeeId', label: 'Employee ID' },
        { key: 'firstName', label: 'First Name' },
        { key: 'lastName', label: 'Last Name' },
        { key: 'role', label: 'Role' },
        { key: 'phone', label: 'Phone' },
        { key: 'status', label: 'Status' },
      ]);
    } else if (selectedReport === 'fees') {
      const payments = await dataService.getAll(id, 'payments');
      const data = payments.map(p => {
        const student = students.find(s => s.id === p.studentId);
        return {
          date: format(new Date(p.date), 'yyyy-MM-dd'),
          studentName: student ? `${student.firstName} ${student.lastName}` : 'N/A',
          amount: p.amount,
          method: p.method,
        };
      });
      exportToExcel(data, `${selectedReport}-report`, [
        { key: 'date', label: 'Date' },
        { key: 'studentName', label: 'Student' },
        { key: 'amount', label: 'Amount' },
        { key: 'method', label: 'Method' },
      ]);
    } else if (selectedReport === 'attendance') {
      const attendance = await dataService.getAll(id, 'attendance');
      const data = attendance.map(a => {
        const student = students.find(s => s.id === a.entityId);
        return {
          date: a.date,
          studentName: student ? `${student.firstName} ${student.lastName}` : 'N/A',
          status: a.status,
        };
      });
      exportToExcel(data, `${selectedReport}-report`, [
        { key: 'date', label: 'Date' },
        { key: 'studentName', label: 'Student' },
        { key: 'status', label: 'Status' },
      ]);
    } else if (selectedReport === 'classes') {
      const classes = await dataService.getAll(id, 'classes');
      const data = classes.map(c => ({
        name: c.name,
        level: c.level,
        stream: c.stream || '-',
        capacity: c.capacity,
        enrolled: students.filter(s => s.classId === c.id).length,
      }));
      exportToExcel(data, `${selectedReport}-report`, [
        { key: 'name', label: 'Class' },
        { key: 'level', label: 'Level' },
        { key: 'stream', label: 'Stream' },
        { key: 'capacity', label: 'Capacity' },
        { key: 'enrolled', label: 'Enrolled' },
      ]);
    }
    addToast('Report exported to Excel', 'success');
    setShowExportMenu(false);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">
          Reports
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Generate and export school reports</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {reportTypes.map((report, index) => {
          const cardColors = ['card-solid-indigo', 'card-solid-emerald', 'card-solid-violet', 'card-solid-rose', 'card-solid-cyan'];
          return (
            <button
              key={report.id}
              onClick={() => setSelectedReport(report.id as ReportType)}
              className={`${cardColors[index]} p-5 text-left transition-all ${
                selectedReport === report.id ? 'ring-2 ring-white/50 ring-offset-2 ring-offset-transparent' : ''
              }`}
            >
              <report.icon size={28} className="mb-3 text-white" />
              <h3 className="font-semibold text-white">{report.label}</h3>
              <p className="text-xs text-white/80 mt-1">{report.description}</p>
            </button>
          );
        })}
      </div>

      <div className="card">
        <div className="card-header">Report Options</div>
        <div className="card-body">
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="flex-1">
              <label className="form-label">From Date</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="form-input" />
            </div>
            <div className="flex-1">
              <label className="form-label">To Date</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="form-input" />
            </div>
          </div>
          <div className="relative" ref={exportMenuRef}>
            <button 
              onClick={() => setShowExportMenu(!showExportMenu)} 
              className="btn btn-primary"
            >
              <Download size={18} />
              Export Report
              <ChevronDown size={14} className={`transition-transform ml-1 ${showExportMenu ? 'rotate-180' : ''}`} />
            </button>
            {showExportMenu && (
              <div className="absolute left-0 mt-2 w-44 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-50 overflow-hidden">
                <button
                  onClick={handleExport}
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
        </div>
      </div>
    </div>
  );
}

