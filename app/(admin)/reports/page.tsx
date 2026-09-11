'use client';

import { useEffect, useState } from 'react';
import flatpickr from 'flatpickr';
import 'flatpickr/dist/flatpickr.min.css';
import { createClient } from '@/lib/supabase/client';
import { exportToExcel, exportToPDF, preloadLogoForPDF } from '@/lib/exportHelpers';
import { getAppSettings } from '@/lib/settings';
import { useToast, ToastContainer } from '@/components/Toast';
import TomSelectField from '@/components/TomSelectField';
import TomSelectMulti from '@/components/TomSelectMulti';
import ReportTable, { type ReportColumn } from '@/components/ReportTable';
import {
  getFilteredReport, getFacultyLeaveSummary, getDailyStats, getDailyFullTable, getRescheduledSlots,
  courseLbl, fmtDate, fmtTime, STATUS_LABELS, LEAVE_TYPE_LABELS,
} from '@/lib/reportsData';
import './reports.css';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

/** Local calendar date as YYYY-MM-DD — never use toISOString() for this (it converts to UTC, which shifts the date for any timezone ahead of UTC). */
function localDateStr(d: Date = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function sBadge(status: string) {
  const cls: Record<string, string> = { on_time: 'badge-on-time', late: 'badge-late', not_engaged: 'badge-not-engaged', not_marked: 'badge-not-marked' };
  return <span className={`badge ${cls[status] ?? 'badge-not-marked'}`}>{STATUS_LABELS[status] ?? status}</span>;
}
function sBadgeText(status: string) {
  return STATUS_LABELS[status] ?? status ?? '—';
}
function modFlags(r: Row) {
  const f: string[] = [];
  if (r?.is_time_changed) f.push('⏱Time');
  if (r?.is_room_changed) f.push('🚪Room');
  if (r?.is_replaced) f.push('👤Repl');
  if (!f.length) return <span>—</span>;
  return (
    <>
      {f.map((x) => (
        <span key={x} className="badge badge-mod" style={{ marginRight: 4 }}>{x}</span>
      ))}
    </>
  );
}
function modFlagsText(r: Row) {
  const f: string[] = [];
  if (r?.is_time_changed) f.push('Time');
  if (r?.is_room_changed) f.push('Room');
  if (r?.is_replaced) f.push('Repl');
  return f.length ? f.join(' ') : '—';
}

const NAV_GROUPS: { label: string; items: { key: string; label: string }[] }[] = [
  { label: 'Execution', items: [
    { key: 'r1', label: '1. Daily Summary' },
    { key: 'r2', label: '2. Faculty Lectures' },
    { key: 'r8', label: '3. Not Engaged / Unmarked' },
  ] },
  { label: 'Custom Reports', items: [
    { key: 'rc1', label: 'Daily Execution Report' },
    { key: 'rc2', label: 'Lecture Taken Report' },
  ] },
  { label: 'Academics', items: [
    { key: 'r4', label: '4. By Course' },
    { key: 'r5', label: '5. By Subject' },
    { key: 'r6', label: '6. By Room' },
    { key: 'r9', label: '7. Rescheduled Slots' },
  ] },
  { label: 'Leave', items: [
    { key: 'r3', label: '8. Leave Summary' },
  ] },
];

const RC1_STATUS_BG: Record<string, string> = { on_time: '#d4f7e7', late: '#fff3cd', not_engaged: '#fde8ea', not_marked: '#f0f0f0' };
const RC1_STATUS_COL: Record<string, string> = { on_time: '#1a7a4a', late: '#8a6000', not_engaged: '#a01828', not_marked: '#666' };
const RC1_STATUS_LBL: Record<string, string> = { on_time: 'On Time', late: 'Late', not_engaged: 'Not Engaged', not_marked: 'Not Marked' };

export default function ReportsPage() {
  const supabase = createClient();
  const { toasts, toast } = useToast();

  const [activeReport, setActiveReport] = useState('r1');
  const [dropdownsLoading, setDropdownsLoading] = useState(true);
  const [faculty, setFaculty] = useState<{ id: string; full_name: string }[]>([]);
  const [courses, setCourses] = useState<{ id: string; year: string; program: string; division: string | null }[]>([]);
  const [subjects, setSubjects] = useState<{ id: string; subject_name: string }[]>([]);
  const [rooms, setRooms] = useState<{ id: string; room_code: string }[]>([]);
  const [generatedBy, setGeneratedBy] = useState('Admin');

  const [r1Data, setR1Data] = useState<Row[]>([]);
  const [r1Stats, setR1Stats] = useState<Row | null>(null);
  const [r1Loading, setR1Loading] = useState(false);
  const [r1HasRun, setR1HasRun] = useState(false);
  const [r1Search, setR1Search] = useState('');
  const [r1Date, setR1Date] = useState(() => localDateStr());

  const [r2Faculty, setR2Faculty] = useState('');
  const [r2From, setR2From] = useState('');
  const [r2To, setR2To] = useState('');
  const [r2Status, setR2Status] = useState('');
  const [r2Data, setR2Data] = useState<Row[]>([]);
  const [r2Loading, setR2Loading] = useState(false);
  const [r2HasRun, setR2HasRun] = useState(false);
  const [r2Search, setR2Search] = useState('');

  const [r3Faculty, setR3Faculty] = useState('');
  const [r3From, setR3From] = useState('');
  const [r3To, setR3To] = useState('');
  const [r3Data, setR3Data] = useState<Row[]>([]);
  const [r3Summary, setR3Summary] = useState<Row[]>([]);
  const [r3Loading, setR3Loading] = useState(false);
  const [r3HasRun, setR3HasRun] = useState(false);
  const [r3Search, setR3Search] = useState('');

  const [r4Course, setR4Course] = useState('');
  const [r4From, setR4From] = useState('');
  const [r4To, setR4To] = useState('');
  const [r4Status, setR4Status] = useState('');
  const [r4Data, setR4Data] = useState<Row[]>([]);
  const [r4Loading, setR4Loading] = useState(false);
  const [r4HasRun, setR4HasRun] = useState(false);
  const [r4Search, setR4Search] = useState('');

  const [r5Subject, setR5Subject] = useState('');
  const [r5From, setR5From] = useState('');
  const [r5To, setR5To] = useState('');
  const [r5Faculty, setR5Faculty] = useState('');
  const [r5Status, setR5Status] = useState('');
  const [r5Data, setR5Data] = useState<Row[]>([]);
  const [r5Loading, setR5Loading] = useState(false);
  const [r5HasRun, setR5HasRun] = useState(false);
  const [r5Search, setR5Search] = useState('');

  const [r6Room, setR6Room] = useState('');
  const [r6From, setR6From] = useState('');
  const [r6To, setR6To] = useState('');
  const [r6Data, setR6Data] = useState<Row[]>([]);
  const [r6Loading, setR6Loading] = useState(false);
  const [r6HasRun, setR6HasRun] = useState(false);
  const [r6Search, setR6Search] = useState('');

  const [r8From, setR8From] = useState('');
  const [r8To, setR8To] = useState('');
  const [r8Faculty, setR8Faculty] = useState('');
  const [r8Course, setR8Course] = useState('');
  const [r8Status, setR8Status] = useState('');
  const [r8Data, setR8Data] = useState<Row[]>([]);
  const [r8Loading, setR8Loading] = useState(false);
  const [r8HasRun, setR8HasRun] = useState(false);
  const [r8Search, setR8Search] = useState('');

  const [r9From, setR9From] = useState('');
  const [r9To, setR9To] = useState('');
  const [r9Data, setR9Data] = useState<Row[]>([]);
  const [r9Loading, setR9Loading] = useState(false);
  const [r9HasRun, setR9HasRun] = useState(false);
  const [r9Search, setR9Search] = useState('');

  const [rc1Date, setRc1Date] = useState('');
  const [rc1Loading, setRc1Loading] = useState(false);
  const [rc1HasRun, setRc1HasRun] = useState(false);
  const [rc1Rooms, setRc1Rooms] = useState<Row[]>([]);
  const [rc1Slots, setRc1Slots] = useState<Row[]>([]);
  const [rc1ScheduleMap, setRc1ScheduleMap] = useState<Record<string, Record<string, Row>>>({});
  const [rc1VirtualEntries, setRc1VirtualEntries] = useState<Row[]>([]);
  const [rc1ExecMap, setRc1ExecMap] = useState<Record<string, string>>({});
  const [rc1RemarksData, setRc1RemarksData] = useState<Row[]>([]);

  const [rc2From, setRc2From] = useState('');
  const [rc2To, setRc2To] = useState('');
  const [rc2Type, setRc2Type] = useState('all');
  const [rc2FacultyIds, setRc2FacultyIds] = useState<string[]>([]);
  const [rc2Data, setRc2Data] = useState<Row[]>([]);
  const [rc2Loading, setRc2Loading] = useState(false);
  const [rc2HasRun, setRc2HasRun] = useState(false);
  const [rc2Search, setRc2Search] = useState('');

  useEffect(() => {
    preloadLogoForPDF();
    (async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (authData.user) {
        const { data } = await supabase.from('admin_users').select('full_name').eq('id', authData.user.id).maybeSingle();
        if (data?.full_name) setGeneratedBy(data.full_name);
      }
      setDropdownsLoading(true);
      const [f, c, s, r] = await Promise.all([
        supabase.from('faculty').select('id, full_name').eq('is_active', true).order('full_name'),
        supabase.from('courses').select('id, year, program, division').eq('is_active', true).order('year').order('program'),
        supabase.from('subjects').select('id, subject_name').eq('is_active', true).order('subject_name'),
        supabase.from('rooms').select('id, room_code').eq('is_active', true).order('room_code'),
      ]);
      setFaculty((f.data ?? []).sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '')));
      setCourses((c.data ?? []).sort((a, b) => courseLbl(a).localeCompare(courseLbl(b))));
      setSubjects((s.data ?? []).sort((a, b) => (a.subject_name || '').localeCompare(b.subject_name || '')));
      setRooms((r.data ?? []).sort((a, b) => (a.room_code || '').localeCompare(b.room_code || '')));
      setDropdownsLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const today = localDateStr();
    const setters: Record<string, (v: string) => void> = {
      r1Date: setR1Date, rc1Date: setRc1Date,
      r2From: setR2From, r2To: setR2To, r3From: setR3From, r3To: setR3To,
      r4From: setR4From, r4To: setR4To, r5From: setR5From, r5To: setR5To,
      r6From: setR6From, r6To: setR6To, r8From: setR8From, r8To: setR8To,
      r9From: setR9From, r9To: setR9To, rc2From: setRc2From, rc2To: setRc2To,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fps: any[] = [];
    Object.entries(setters).forEach(([id, setter]) => {
      const el = document.getElementById(id);
      if (!el) return;
      const fp = flatpickr(el, {
        dateFormat: 'Y-m-d',
        disableMobile: true,
        defaultDate: id === 'r1Date' ? today : undefined,
        onChange: (_dates, dateStr) => setter(dateStr),
      });
      fps.push(fp);
    });
    return () => fps.forEach((fp) => fp.destroy());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeReport]);

  const facultyOptions = faculty.map((f) => ({ value: f.id, label: `Prof. ${f.full_name}` }));
  const courseOptions = courses.map((c) => ({ value: c.id, label: courseLbl(c) }));
  const subjectOptions = subjects.map((s) => ({ value: s.id, label: s.subject_name }));
  const roomOptions = rooms.map((r) => ({ value: r.id, label: `Room ${r.room_code}` }));

  async function runR1() {
    if (!r1Date) { toast('Pick a date.', 'warn'); return; }
    setR1Loading(true);
    setR1HasRun(true);
    setR1Search('');
    try {
      const [stats, rows] = await Promise.all([getDailyStats(r1Date), getDailyFullTable(r1Date)]);
      rows.sort((a: Row, b: Row) => (a.time_slot?.sort_order ?? 0) - (b.time_slot?.sort_order ?? 0));
      setR1Data(rows);
      setR1Stats(stats);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setR1Loading(false);
    }
  }
  const r1Columns: ReportColumn<Row>[] = [
    { header: 'Time', render: (r) => `${fmtTime(r.time_slot?.start_time)}–${fmtTime(r.time_slot?.end_time)}`, textVal: (r) => `${fmtTime(r.time_slot?.start_time)}–${fmtTime(r.time_slot?.end_time)}` },
    { header: 'Room', render: (r) => <span style={{ color: 'var(--accent)' }}>{r.room?.room_code ?? '—'}</span>, textVal: (r) => r.room?.room_code ?? '—' },
    { header: 'Course', render: (r) => courseLbl(r.course), textVal: (r) => courseLbl(r.course) },
    { header: 'Subject', render: (r) => r.subject?.subject_name ?? '—', textVal: (r) => r.subject?.subject_name ?? '—' },
    { header: 'Faculty', render: (r) => r.assigned_faculty?.full_name ?? '—', textVal: (r) => r.assigned_faculty?.full_name ?? '—' },
    { header: 'Status', render: (r) => sBadge((Array.isArray(r.execution) ? r.execution[0] : r.execution)?.faculty_status ?? 'not_marked'), textVal: (r) => sBadgeText((Array.isArray(r.execution) ? r.execution[0] : r.execution)?.faculty_status ?? 'not_marked') },
    { header: 'Flags', render: (r) => modFlags(Array.isArray(r.execution) ? r.execution[0] : r.execution), textVal: (r) => modFlagsText(Array.isArray(r.execution) ? r.execution[0] : r.execution) },
  ];
  function r1ExportPdf() {
    const flat = r1Data.map((r) => {
      const ex = Array.isArray(r.execution) ? r.execution[0] : r.execution;
      return { time: `${fmtTime(r.time_slot?.start_time)}–${fmtTime(r.time_slot?.end_time)}`, room: r.room?.room_code ?? '—', course: courseLbl(r.course), subject: r.subject?.subject_name ?? '—', faculty: r.assigned_faculty?.full_name ?? '—', status: STATUS_LABELS[ex?.faculty_status ?? 'not_marked'] ?? '—' };
    });
    exportToPDF(flat, [
      { header: 'Time', key: 'time' }, { header: 'Room', key: 'room' }, { header: 'Course', key: 'course' },
      { header: 'Subject', key: 'subject' }, { header: 'Faculty', key: 'faculty' }, { header: 'Status', key: 'status' },
    ], `Daily Summary — ${fmtDate(r1Date)}`, `Daily_Summary_${r1Date}`, r1Date, generatedBy);
  }
  function r1ExportXls() {
    const flat = r1Data.map((r) => {
      const ex = Array.isArray(r.execution) ? r.execution[0] : r.execution;
      return {
        time: `${fmtTime(r.time_slot?.start_time)}–${fmtTime(r.time_slot?.end_time)}`, room: r.room?.room_code ?? '—', course: courseLbl(r.course),
        subject: r.subject?.subject_name ?? '—', faculty: r.assigned_faculty?.full_name ?? '—', status: STATUS_LABELS[ex?.faculty_status ?? 'not_marked'] ?? '—',
        timeChanged: ex?.is_time_changed ? 'Yes' : 'No', roomChanged: ex?.is_room_changed ? 'Yes' : 'No', replaced: ex?.is_replaced ? 'Yes' : 'No',
      };
    });
    exportToExcel(flat, [
      { header: 'Time', key: 'time' }, { header: 'Room', key: 'room' }, { header: 'Course', key: 'course' },
      { header: 'Subject', key: 'subject', width: 24 }, { header: 'Faculty', key: 'faculty', width: 22 }, { header: 'Status', key: 'status' },
      { header: 'Time Changed', key: 'timeChanged' }, { header: 'Room Changed', key: 'roomChanged' }, { header: 'Replaced', key: 'replaced' },
    ], `Daily_Summary_${r1Date}`);
  }

  async function runR2() {
    setR2Loading(true);
    setR2HasRun(true);
    setR2Search('');
    try {
      const rows = await getFilteredReport({ facultyId: r2Faculty || null, fromDate: r2From || null, toDate: r2To || null, faculty_status: r2Status || null }, 'admin', null);
      rows.sort((a: Row, b: Row) => {
        const nameA = a.actual_faculty?.full_name || ''; const nameB = b.actual_faculty?.full_name || '';
        if (nameA !== nameB) return nameA.localeCompare(nameB);
        if (a.schedule_date !== b.schedule_date) return a.schedule_date.localeCompare(b.schedule_date);
        return (a.daily_schedule?.time_slot?.start_time || '').localeCompare(b.daily_schedule?.time_slot?.start_time || '');
      });
      setR2Data(rows);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setR2Loading(false);
    }
  }
  const r2MiniStats = (() => {
    let onTime = 0, late = 0, notEngaged = 0, notMarked = 0;
    r2Data.forEach((r) => { if (r.faculty_status === 'on_time') onTime++; else if (r.faculty_status === 'late') late++; else if (r.faculty_status === 'not_engaged') notEngaged++; else notMarked++; });
    return { onTime, late, notEngaged, notMarked };
  })();
  const r2Columns: ReportColumn<Row>[] = [
    { header: 'Date', render: (r) => fmtDate(r.schedule_date), textVal: (r) => fmtDate(r.schedule_date) },
    { header: 'Time', render: (r) => `${fmtTime(r.daily_schedule?.time_slot?.start_time)}–${fmtTime(r.daily_schedule?.time_slot?.end_time)}`, textVal: (r) => `${fmtTime(r.daily_schedule?.time_slot?.start_time)}–${fmtTime(r.daily_schedule?.time_slot?.end_time)}` },
    { header: 'Course', render: (r) => courseLbl(r.daily_schedule?.course), textVal: (r) => courseLbl(r.daily_schedule?.course) },
    { header: 'Subject', render: (r) => r.daily_schedule?.subject?.subject_name ?? '—', textVal: (r) => r.daily_schedule?.subject?.subject_name ?? '—' },
    { header: 'Status', render: (r) => sBadge(r.faculty_status), textVal: (r) => sBadgeText(r.faculty_status) },
    { header: 'Flags', render: (r) => modFlags(r), textVal: (r) => modFlagsText(r) },
    { header: 'Remarks', render: (r) => <span style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>{r.remarks ?? '—'}</span>, textVal: (r) => r.remarks ?? '—' },
  ];
  function r2Export(kind: 'pdf' | 'xls') {
    const flat = r2Data.map((r) => ({ date: fmtDate(r.schedule_date), time: `${fmtTime(r.daily_schedule?.time_slot?.start_time)}–${fmtTime(r.daily_schedule?.time_slot?.end_time)}`, course: courseLbl(r.daily_schedule?.course), subject: r.daily_schedule?.subject?.subject_name ?? '—', status: STATUS_LABELS[r.faculty_status] ?? '—', remarks: r.remarks ?? '—' }));
    const cols = [{ header: 'Date', key: 'date' }, { header: 'Time', key: 'time' }, { header: 'Course', key: 'course' }, { header: 'Subject', key: 'subject', width: 30 }, { header: 'Status', key: 'status' }, { header: 'Remarks', key: 'remarks', width: 30 }];
    if (kind === 'pdf') exportToPDF(flat, cols, 'Faculty Lectures Report', 'Faculty_Lectures_Report', '', generatedBy);
    else exportToExcel(flat, cols, 'Faculty_Lectures_Report');
  }

  async function runR3() {
    setR3Loading(true);
    setR3HasRun(true);
    setR3Search('');
    try {
      const { rows, summary } = await getFacultyLeaveSummary(r3Faculty || null, r3From || null, r3To || null);
      rows.sort((a: Row, b: Row) => {
        const nameA = a.faculty?.full_name || ''; const nameB = b.faculty?.full_name || '';
        if (nameA !== nameB) return nameA.localeCompare(nameB);
        return (a.leave_date || '').localeCompare(b.leave_date || '');
      });
      (summary as Row[]).sort((a, b) => (a.faculty?.full_name || '').localeCompare(b.faculty?.full_name || ''));
      setR3Data(rows);
      setR3Summary(summary as Row[]);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setR3Loading(false);
    }
  }
  const r3Columns: ReportColumn<Row>[] = [
    { header: 'Faculty', render: (r) => <strong>{r.faculty?.full_name ?? '—'}</strong>, textVal: (r) => r.faculty?.full_name ?? '—' },
    { header: 'Date', render: (r) => fmtDate(r.leave_date), textVal: (r) => fmtDate(r.leave_date) },
    { header: 'Leave Type', render: (r) => LEAVE_TYPE_LABELS[r.leave_type] ?? r.leave_type, textVal: (r) => LEAVE_TYPE_LABELS[r.leave_type] ?? r.leave_type },
    { header: 'Reason', render: (r) => <span style={{ color: 'var(--text-muted)' }}>{r.reason ?? '—'}</span>, textVal: (r) => r.reason ?? '—' },
    { header: 'Status', render: (r) => <span className={`badge ${r.status === 'approved' ? 'badge-active' : 'badge-inactive'}`}>{r.status}</span>, textVal: (r) => r.status },
  ];
  async function r3ExportPdf() {
    if (!r3Data.length) { toast('Run report first.', 'warn'); return; }
    const settings = await getAppSettings();
    const { jsPDF } = await import('jspdf');
    await import('jspdf-autotable');
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    const pageW = doc.internal.pageSize.width;
    const pageH = doc.internal.pageSize.height;
    const head = [['Faculty', 'Date', 'Leave Type', 'Reason', 'Status']];
    const body = r3Data.map((r) => [r.faculty?.full_name ?? '—', fmtDate(r.leave_date), LEAVE_TYPE_LABELS[r.leave_type] ?? r.leave_type, r.reason ?? '—', r.status.toUpperCase()]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (doc as any).autoTable({
      head, body, startY: 150, theme: 'grid',
      styles: { fontSize: 10, cellPadding: 8, valign: 'middle', overflow: 'linebreak' },
      headStyles: { fillColor: [26, 34, 68], textColor: 255, fontStyle: 'bold', halign: 'center' },
      columnStyles: { 0: { cellWidth: 'auto', halign: 'left' }, 1: { cellWidth: 75, halign: 'center' }, 2: { cellWidth: 80, halign: 'center' }, 3: { cellWidth: 160, halign: 'left' }, 4: { cellWidth: 80, halign: 'center' } },
      margin: { top: 150, left: 40, right: 40, bottom: 40 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      didDrawPage(data: any) {
        const cx = pageW / 2;
        doc.setFont('times', 'bold'); doc.setFontSize(22); doc.setTextColor(26, 34, 68);
        doc.text(settings.college_name, cx, 50, { align: 'center' });
        doc.setFont('times', 'normal'); doc.setFontSize(14); doc.setTextColor(50, 60, 90);
        doc.text(settings.college_subtitle, cx, 70, { align: 'center' });
        doc.setFont('times', 'bolditalic'); doc.setFontSize(16);
        doc.text(settings.department_name, cx, 90, { align: 'center' });
        doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(26, 34, 68);
        doc.text('Faculty Leave Summary', cx, 125, { align: 'center' });
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(120);
        doc.text(`Report Generated By: ${generatedBy}`, 40, pageH - 20);
        doc.text(`Report Generated On: ${new Date().toLocaleString('en-IN')}`, 40, pageH - 10);
        doc.text(`Page ${data.pageNumber}`, pageW / 2, pageH - 15, { align: 'center' });
      },
    });
    doc.save('Faculty_Leave_Summary.pdf');
  }
  function r3ExportXls() {
    const flat = r3Data.map((r) => ({ faculty: r.faculty?.full_name ?? '—', date: fmtDate(r.leave_date), type: LEAVE_TYPE_LABELS[r.leave_type] ?? r.leave_type, reason: r.reason ?? '—', status: r.status }));
    exportToExcel(flat, [{ header: 'Faculty', key: 'faculty', width: 24 }, { header: 'Date', key: 'date' }, { header: 'Leave Type', key: 'type', width: 20 }, { header: 'Reason', key: 'reason', width: 35 }, { header: 'Status', key: 'status' }], 'Leave_Summary');
  }

  async function runR4() {
    if (!r4Course) { toast('Select a course.', 'warn'); return; }
    setR4Loading(true);
    setR4HasRun(true);
    setR4Search('');
    try {
      const rows = await getFilteredReport({ courseId: r4Course, fromDate: r4From || null, toDate: r4To || null, faculty_status: r4Status || null }, 'admin', null);
      rows.sort((a: Row, b: Row) => {
        const cA = courseLbl(a.daily_schedule?.course); const cB = courseLbl(b.daily_schedule?.course);
        if (cA !== cB) return cA.localeCompare(cB);
        if (a.schedule_date !== b.schedule_date) return (a.schedule_date || '').localeCompare(b.schedule_date || '');
        return (a.daily_schedule?.time_slot?.start_time || '').localeCompare(b.daily_schedule?.time_slot?.start_time || '');
      });
      setR4Data(rows);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setR4Loading(false);
    }
  }
  const r4Columns: ReportColumn<Row>[] = [
    { header: 'Date', render: (r) => fmtDate(r.schedule_date), textVal: (r) => fmtDate(r.schedule_date) },
    { header: 'Time', render: (r) => `${fmtTime(r.daily_schedule?.time_slot?.start_time)}–${fmtTime(r.daily_schedule?.time_slot?.end_time)}`, textVal: (r) => `${fmtTime(r.daily_schedule?.time_slot?.start_time)}–${fmtTime(r.daily_schedule?.time_slot?.end_time)}` },
    { header: 'Subject', render: (r) => r.daily_schedule?.subject?.subject_name ?? '—', textVal: (r) => r.daily_schedule?.subject?.subject_name ?? '—' },
    { header: 'Faculty', render: (r) => r.actual_faculty?.full_name ?? '—', textVal: (r) => r.actual_faculty?.full_name ?? '—' },
    { header: 'Room', render: (r) => r.daily_schedule?.room?.room_code ?? '—', textVal: (r) => r.daily_schedule?.room?.room_code ?? '—' },
    { header: 'Status', render: (r) => sBadge(r.faculty_status), textVal: (r) => sBadgeText(r.faculty_status) },
    { header: 'Flags', render: (r) => modFlags(r), textVal: (r) => modFlagsText(r) },
  ];
  function r4Export(kind: 'pdf' | 'xls') {
    const flat = r4Data.map((r) => ({ date: fmtDate(r.schedule_date), time: `${fmtTime(r.daily_schedule?.time_slot?.start_time)}–${fmtTime(r.daily_schedule?.time_slot?.end_time)}`, subject: r.daily_schedule?.subject?.subject_name ?? '—', faculty: r.actual_faculty?.full_name ?? '—', room: r.daily_schedule?.room?.room_code ?? '—', status: STATUS_LABELS[r.faculty_status] ?? '—' }));
    const cols = [{ header: 'Date', key: 'date' }, { header: 'Time', key: 'time' }, { header: 'Subject', key: 'subject', width: 28 }, { header: 'Faculty', key: 'faculty', width: 22 }, { header: 'Room', key: 'room' }, { header: 'Status', key: 'status' }];
    if (kind === 'pdf') exportToPDF(flat, cols, 'By Course Report', 'Report_By_Course', '', generatedBy);
    else exportToExcel(flat, cols, 'Report_By_Course');
  }

  async function runR5() {
    if (!r5Subject) { toast('Select a subject.', 'warn'); return; }
    setR5Loading(true);
    setR5HasRun(true);
    setR5Search('');
    try {
      const rows = await getFilteredReport({ subjectId: r5Subject, fromDate: r5From || null, toDate: r5To || null, facultyId: r5Faculty || null, faculty_status: r5Status || null }, 'admin', null);
      rows.sort((a: Row, b: Row) => {
        const sA = a.daily_schedule?.subject?.subject_name || ''; const sB = b.daily_schedule?.subject?.subject_name || '';
        if (sA !== sB) return sA.localeCompare(sB);
        if (a.schedule_date !== b.schedule_date) return (a.schedule_date || '').localeCompare(b.schedule_date || '');
        return (a.daily_schedule?.time_slot?.start_time || '').localeCompare(b.daily_schedule?.time_slot?.start_time || '');
      });
      setR5Data(rows);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setR5Loading(false);
    }
  }
  const r5Columns: ReportColumn<Row>[] = [
    { header: 'Date', render: (r) => fmtDate(r.schedule_date), textVal: (r) => fmtDate(r.schedule_date) },
    { header: 'Time', render: (r) => `${fmtTime(r.daily_schedule?.time_slot?.start_time)}–${fmtTime(r.daily_schedule?.time_slot?.end_time)}`, textVal: (r) => `${fmtTime(r.daily_schedule?.time_slot?.start_time)}–${fmtTime(r.daily_schedule?.time_slot?.end_time)}` },
    { header: 'Course', render: (r) => courseLbl(r.daily_schedule?.course), textVal: (r) => courseLbl(r.daily_schedule?.course) },
    { header: 'Faculty', render: (r) => r.actual_faculty?.full_name ?? '—', textVal: (r) => r.actual_faculty?.full_name ?? '—' },
    { header: 'Room', render: (r) => r.daily_schedule?.room?.room_code ?? '—', textVal: (r) => r.daily_schedule?.room?.room_code ?? '—' },
    { header: 'Status', render: (r) => sBadge(r.faculty_status), textVal: (r) => sBadgeText(r.faculty_status) },
  ];
  function r5Export(kind: 'pdf' | 'xls') {
    const flat = r5Data.map((r) => ({ date: fmtDate(r.schedule_date), time: `${fmtTime(r.daily_schedule?.time_slot?.start_time)}–${fmtTime(r.daily_schedule?.time_slot?.end_time)}`, course: courseLbl(r.daily_schedule?.course), faculty: r.actual_faculty?.full_name ?? '—', room: r.daily_schedule?.room?.room_code ?? '—', status: STATUS_LABELS[r.faculty_status] ?? '—' }));
    const cols = [{ header: 'Date', key: 'date' }, { header: 'Time', key: 'time' }, { header: 'Course', key: 'course', width: 18 }, { header: 'Faculty', key: 'faculty', width: 22 }, { header: 'Room', key: 'room' }, { header: 'Status', key: 'status' }];
    if (kind === 'pdf') exportToPDF(flat, cols, 'By Subject Report', 'Report_By_Subject', '', generatedBy);
    else exportToExcel(flat, cols, 'Report_By_Subject');
  }

  async function runR6() {
    if (!r6Room) { toast('Select a room.', 'warn'); return; }
    setR6Loading(true);
    setR6HasRun(true);
    setR6Search('');
    try {
      const rows = await getFilteredReport({ roomId: r6Room, fromDate: r6From || null, toDate: r6To || null }, 'admin', null);
      rows.sort((a: Row, b: Row) => {
        const rA = a.daily_schedule?.room?.room_code || ''; const rB = b.daily_schedule?.room?.room_code || '';
        if (rA !== rB) return rA.localeCompare(rB);
        if (a.schedule_date !== b.schedule_date) return (a.schedule_date || '').localeCompare(b.schedule_date || '');
        return (a.daily_schedule?.time_slot?.start_time || '').localeCompare(b.daily_schedule?.time_slot?.start_time || '');
      });
      setR6Data(rows);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setR6Loading(false);
    }
  }
  const r6Columns: ReportColumn<Row>[] = [
    { header: 'Date', render: (r) => fmtDate(r.schedule_date), textVal: (r) => fmtDate(r.schedule_date) },
    { header: 'Time', render: (r) => `${fmtTime(r.daily_schedule?.time_slot?.start_time)}–${fmtTime(r.daily_schedule?.time_slot?.end_time)}`, textVal: (r) => `${fmtTime(r.daily_schedule?.time_slot?.start_time)}–${fmtTime(r.daily_schedule?.time_slot?.end_time)}` },
    { header: 'Course', render: (r) => courseLbl(r.daily_schedule?.course), textVal: (r) => courseLbl(r.daily_schedule?.course) },
    { header: 'Subject', render: (r) => r.daily_schedule?.subject?.subject_name ?? '—', textVal: (r) => r.daily_schedule?.subject?.subject_name ?? '—' },
    { header: 'Faculty', render: (r) => r.actual_faculty?.full_name ?? '—', textVal: (r) => r.actual_faculty?.full_name ?? '—' },
    { header: 'Status', render: (r) => sBadge(r.faculty_status), textVal: (r) => sBadgeText(r.faculty_status) },
  ];
  function r6Export(kind: 'pdf' | 'xls') {
    const flat = r6Data.map((r) => ({ date: fmtDate(r.schedule_date), time: `${fmtTime(r.daily_schedule?.time_slot?.start_time)}–${fmtTime(r.daily_schedule?.time_slot?.end_time)}`, course: courseLbl(r.daily_schedule?.course), subject: r.daily_schedule?.subject?.subject_name ?? '—', faculty: r.actual_faculty?.full_name ?? '—', status: STATUS_LABELS[r.faculty_status] ?? '—' }));
    const cols = [{ header: 'Date', key: 'date' }, { header: 'Time', key: 'time' }, { header: 'Course', key: 'course' }, { header: 'Subject', key: 'subject', width: 26 }, { header: 'Faculty', key: 'faculty', width: 22 }, { header: 'Status', key: 'status' }];
    if (kind === 'pdf') exportToPDF(flat, cols, 'By Room Report', 'Report_By_Room', '', generatedBy);
    else exportToExcel(flat, cols, 'Report_By_Room');
  }

  async function runR8() {
    setR8Loading(true);
    setR8HasRun(true);
    setR8Search('');
    try {
      let rows = await getFilteredReport({ fromDate: r8From || null, toDate: r8To || null, facultyId: r8Faculty || null, courseId: r8Course || null }, 'admin', null);
      rows = r8Status ? rows.filter((r: Row) => r.faculty_status === r8Status) : rows.filter((r: Row) => r.faculty_status === 'not_engaged' || r.faculty_status === 'not_marked');
      rows.sort((a: Row, b: Row) => {
        const nameA = a.daily_schedule?.original_faculty?.full_name || ''; const nameB = b.daily_schedule?.original_faculty?.full_name || '';
        if (nameA !== nameB) return nameA.localeCompare(nameB);
        if (a.schedule_date !== b.schedule_date) return (a.schedule_date || '').localeCompare(b.schedule_date || '');
        return (a.daily_schedule?.time_slot?.start_time || '').localeCompare(b.daily_schedule?.time_slot?.start_time || '');
      });
      setR8Data(rows);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setR8Loading(false);
    }
  }
  function r8Blamed(r: Row) {
    return r.is_replaced ? r.daily_schedule?.original_faculty?.full_name : (r.actual_faculty?.full_name || r.daily_schedule?.assigned_faculty?.full_name);
  }
  const r8Columns: ReportColumn<Row>[] = [
    { header: 'Date', render: (r) => fmtDate(r.schedule_date), textVal: (r) => fmtDate(r.schedule_date) },
    { header: 'Time', render: (r) => `${fmtTime(r.daily_schedule?.time_slot?.start_time)}–${fmtTime(r.daily_schedule?.time_slot?.end_time)}`, textVal: (r) => `${fmtTime(r.daily_schedule?.time_slot?.start_time)}–${fmtTime(r.daily_schedule?.time_slot?.end_time)}` },
    { header: 'Course', render: (r) => courseLbl(r.daily_schedule?.course), textVal: (r) => courseLbl(r.daily_schedule?.course) },
    { header: 'Subject', render: (r) => r.daily_schedule?.subject?.subject_name ?? '—', textVal: (r) => r.daily_schedule?.subject?.subject_name ?? '—' },
    { header: 'Faculty', render: (r) => <span style={{ color: 'var(--error)', fontWeight: 600 }}>{r8Blamed(r) ?? '—'}</span>, textVal: (r) => r8Blamed(r) ?? '—' },
    { header: 'Status', render: (r) => sBadge(r.faculty_status), textVal: (r) => sBadgeText(r.faculty_status) },
    { header: 'Remarks', render: (r) => <span style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>{r.remarks ?? (r.is_replaced ? '(Replaced by proxy)' : '—')}</span>, textVal: (r) => r.remarks ?? (r.is_replaced ? 'Replaced by proxy' : '—') },
  ];
  function r8Export(kind: 'pdf' | 'xls') {
    const flat = r8Data.map((r) => ({ date: fmtDate(r.schedule_date), time: `${fmtTime(r.daily_schedule?.time_slot?.start_time)}–${fmtTime(r.daily_schedule?.time_slot?.end_time)}`, course: courseLbl(r.daily_schedule?.course), subject: r.daily_schedule?.subject?.subject_name ?? '—', faculty: r8Blamed(r) ?? '—', status: STATUS_LABELS[r.faculty_status] ?? '—', remarks: r.remarks ?? (r.is_replaced ? 'Replaced by proxy' : '—') }));
    const cols = [{ header: 'Date', key: 'date' }, { header: 'Time', key: 'time' }, { header: 'Course', key: 'course' }, { header: 'Subject', key: 'subject', width: 26 }, { header: 'Faculty', key: 'faculty', width: 22 }, { header: 'Status', key: 'status' }, { header: 'Remarks', key: 'remarks', width: 30 }];
    if (kind === 'pdf') exportToPDF(flat, cols, 'Not Engaged / Not Marked', 'Not_Engaged_Report', '', generatedBy);
    else exportToExcel(flat, cols, 'Not_Engaged_Report');
  }

  async function runR9() {
    setR9Loading(true);
    setR9HasRun(true);
    setR9Search('');
    try {
      const rows = await getRescheduledSlots(r9From || null, r9To || null);
      (rows as Row[]).sort((a, b) => {
        const nameA = a.assigned_faculty?.full_name || ''; const nameB = b.assigned_faculty?.full_name || '';
        if (nameA !== nameB) return nameA.localeCompare(nameB);
        if (a.schedule_date !== b.schedule_date) return (a.schedule_date || '').localeCompare(b.schedule_date || '');
        return (a.time_slot?.start_time || '').localeCompare(b.time_slot?.start_time || '');
      });
      setR9Data(rows as Row[]);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setR9Loading(false);
    }
  }
  const r9Columns: ReportColumn<Row>[] = [
    { header: 'Date', render: (r) => fmtDate(r.schedule_date), textVal: (r) => fmtDate(r.schedule_date) },
    { header: 'Time', render: (r) => `${fmtTime(r.time_slot?.start_time)}–${fmtTime(r.time_slot?.end_time)}`, textVal: (r) => `${fmtTime(r.time_slot?.start_time)}–${fmtTime(r.time_slot?.end_time)}` },
    { header: 'Room', render: (r) => r.room?.room_code ?? '—', textVal: (r) => r.room?.room_code ?? '—' },
    { header: 'Course', render: (r) => courseLbl(r.course), textVal: (r) => courseLbl(r.course) },
    { header: 'New Subject', render: (r) => r.subject?.subject_name ?? '—', textVal: (r) => r.subject?.subject_name ?? '—' },
    { header: 'New Faculty', render: (r) => r.assigned_faculty?.full_name ?? '—', textVal: (r) => r.assigned_faculty?.full_name ?? '—' },
  ];
  function r9Export(kind: 'pdf' | 'xls') {
    const flat = r9Data.map((r) => ({ date: fmtDate(r.schedule_date), time: `${fmtTime(r.time_slot?.start_time)}–${fmtTime(r.time_slot?.end_time)}`, room: r.room?.room_code ?? '—', course: courseLbl(r.course), subject: r.subject?.subject_name ?? '—', faculty: r.assigned_faculty?.full_name ?? '—' }));
    const cols = [{ header: 'Date', key: 'date' }, { header: 'Time', key: 'time' }, { header: 'Room', key: 'room' }, { header: 'Course', key: 'course' }, { header: 'New Subject', key: 'subject', width: 28 }, { header: 'New Faculty', key: 'faculty', width: 22 }];
    if (kind === 'pdf') exportToPDF(flat, cols, 'Rescheduled Slots', 'Rescheduled_Slots', '', generatedBy);
    else exportToExcel(flat, cols, 'Rescheduled_Slots');
  }

  async function runRc1() {
    if (!rc1Date) { toast('Select a date.', 'warn'); return; }
    setRc1Loading(true);
    setRc1HasRun(true);
    try {
      const dayType = new Date(rc1Date + 'T00:00:00').getDay() === 6 ? 'saturday' : 'weekday';
      const [slotsRes, roomsRes, schedRes, execRes, remarksRes] = await Promise.all([
        supabase.from('time_slots').select('id,slot_label,start_time,end_time,slot_type,sort_order').eq('day_type', dayType).order('sort_order'),
        supabase.from('rooms').select('id,room_code').eq('is_active', true).order('room_code'),
        supabase.from('daily_schedule').select(`
          id,is_cancelled,is_rescheduled,time_slot_id,room_id,
          time_slot:time_slots(id,slot_label,start_time,end_time,slot_type,sort_order),
          room:rooms(id,room_code), course:courses(year,program,division), subject:subjects(subject_name),
          assigned_faculty:faculty!assigned_faculty_id(id,full_name), original_faculty:faculty!original_faculty_id(id,full_name),
          csf:course_subject_faculty!csf_id(subject:subjects(subject_name))
        `).eq('schedule_date', rc1Date),
        supabase.from('lecture_execution').select('daily_schedule_id,faculty_status').eq('schedule_date', rc1Date),
        supabase.from('faculty_remarks').select('*, faculty(full_name)').eq('date', rc1Date).order('start_time', { ascending: true }),
      ]);
      if (slotsRes.error) throw slotsRes.error;
      if (roomsRes.error) throw roomsRes.error;
      if (schedRes.error) throw schedRes.error;
      if (remarksRes.error) throw remarksRes.error;

      const rooms_ = (roomsRes.data ?? []).filter((r) => r.room_code.toUpperCase() !== 'VIRTUAL');
      const sMap: Record<string, Record<string, Row>> = {};
      const virtual: Row[] = [];
      for (const row of (schedRes.data ?? []) as Row[]) {
        if (!row.time_slot_id) virtual.push(row);
        else { if (!sMap[row.time_slot_id]) sMap[row.time_slot_id] = {}; sMap[row.time_slot_id][row.room_id] = row; }
      }
      const eMap: Record<string, string> = {};
      for (const ex of execRes.data ?? []) eMap[ex.daily_schedule_id] = ex.faculty_status;

      setRc1Slots(slotsRes.data ?? []);
      setRc1Rooms(rooms_);
      setRc1ScheduleMap(sMap);
      setRc1VirtualEntries(virtual);
      setRc1ExecMap(eMap);
      setRc1RemarksData(remarksRes.data ?? []);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setRc1Loading(false);
    }
  }
  const rc1Stats = (() => {
    let onTime = 0, late = 0, notEngaged = 0, notMarked = 0, cancelled = 0;
    const count = (row: Row) => {
      if (row.is_cancelled) { cancelled++; return; }
      const s = rc1ExecMap[row.id] ?? 'not_marked';
      if (s === 'on_time') onTime++; else if (s === 'late') late++; else if (s === 'not_engaged') notEngaged++; else notMarked++;
    };
    for (const tsMap of Object.values(rc1ScheduleMap)) for (const row of Object.values(tsMap)) { if (row.time_slot?.slot_type !== 'lecture') continue; count(row); }
    rc1VirtualEntries.forEach(count);
    return { onTime, late, notEngaged, notMarked, cancelled };
  })();
  function rc1Cell(row: Row | undefined) {
    if (!row) return <div style={{ borderRight: '1px solid var(--border)', minHeight: 64 }} />;
    const s = row.is_cancelled ? 'cancelled' : (rc1ExecMap[row.id] ?? 'not_marked');
    const bg = row.is_cancelled ? '#f0f0f0' : (RC1_STATUS_BG[s] ?? '#f8f8f8');
    const col = row.is_cancelled ? '#999' : (RC1_STATUS_COL[s] ?? '#444');
    const lbl = row.is_cancelled ? 'CANCELLED' : (RC1_STATUS_LBL[s] ?? 'Not Marked');
    const cname = courseLbl(row.course);
    const origFId = row.original_faculty?.id, assignFId = row.assigned_faculty?.id;
    const isReplaced = row.is_rescheduled && origFId && assignFId && origFId !== assignFId;

    if (isReplaced) {
      const origS = row.subject?.subject_name ?? '—', origF = row.original_faculty?.full_name ?? '—';
      const newS = row.csf?.subject?.subject_name ?? origS, newF = row.assigned_faculty?.full_name ?? '—';
      return (
        <div style={{ padding: '.38rem .45rem', borderRight: '1px solid var(--border)', minHeight: 64, background: bg, display: 'flex', flexDirection: 'column', gap: '.08rem' }}>
          <div style={{ fontSize: '.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: col, opacity: 0.75 }}>{cname}</div>
          <div style={{ fontSize: '.65rem', color: 'var(--error)', textDecoration: 'line-through', marginTop: 2 }}>{origS}</div>
          <div style={{ fontSize: '.6rem', color: 'var(--error)', textDecoration: 'line-through' }}>{origF}</div>
          <div style={{ fontSize: '.72rem', fontWeight: 600, color: 'var(--success)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{newS}</div>
          <div style={{ fontSize: '.65rem', color: 'var(--success)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{newF}</div>
          <div style={{ fontSize: '.58rem', fontWeight: 700, color: col, marginTop: '.15rem' }}>[{lbl}]</div>
        </div>
      );
    }
    const sub = row.subject?.subject_name ?? '—';
    const fac = row.original_faculty?.full_name || row.assigned_faculty?.full_name || '—';
    return (
      <div style={{ padding: '.38rem .45rem', borderRight: '1px solid var(--border)', minHeight: 64, background: bg, display: 'flex', flexDirection: 'column', gap: '.08rem' }}>
        <div style={{ fontSize: '.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: col, opacity: 0.75 }}>{cname}</div>
        <div style={{ fontSize: '.72rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>
        <div style={{ fontSize: '.65rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fac}</div>
        <div style={{ fontSize: '.58rem', fontWeight: 700, color: col, marginTop: '.15rem' }}>[{lbl}]</div>
      </div>
    );
  }
  async function rc1ExportPdf() {
    if (!rc1Slots.length || !rc1Rooms.length) { toast('Run report first.', 'warn'); return; }
    const settings = await getAppSettings();
    const { jsPDF } = await import('jspdf');
    await import('jspdf-autotable');
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a0' });
    const pageW = doc.internal.pageSize.width;
    const pageH = doc.internal.pageSize.height;
    const dateLabel = fmtDate(rc1Date);

    const { data: facultyList, error: facErr } = await supabase.from('faculty').select('id, full_name, faculty_type').eq('is_active', true).order('full_name');
    if (facErr) { toast(facErr.message, 'error'); return; }

    const facStats: Record<string, { name: string; allotted: number; taken: number; late: number }> = {};
    (facultyList ?? []).forEach((f) => { facStats[f.id] = { name: f.full_name, allotted: 0, taken: 0, late: 0 }; });

    function trackStat(row: Row, status: string) {
      if (row.is_cancelled) return;
      const origFId = row.original_faculty?.id;
      const assignFId = row.assigned_faculty?.id;
      const isReplaced = row.is_rescheduled && origFId && assignFId && origFId !== assignFId;
      if (isReplaced) {
        if (facStats[origFId]) facStats[origFId].allotted++;
        if (facStats[assignFId] && (status === 'on_time' || status === 'late')) {
          facStats[assignFId].taken++;
          if (status === 'late') facStats[assignFId].late++;
        }
      } else {
        const fId = assignFId || origFId;
        if (fId && facStats[fId]) {
          facStats[fId].allotted++;
          if (status === 'on_time' || status === 'late') {
            facStats[fId].taken++;
            if (status === 'late') facStats[fId].late++;
          }
        }
      }
    }

    const head = [['Time', ...rc1Rooms.map((r) => `Room ${r.room_code}`)]];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: any[] = [];
    rc1Slots.forEach((slot) => {
      const timeLabel = `${slot.slot_label ?? ''}\n\n${slot.start_time.slice(0, 5)} - ${slot.end_time.slice(0, 5)}`;
      if (slot.slot_type !== 'lecture') {
        body.push([{ content: timeLabel, styles: { fontStyle: 'bold', valign: 'middle', halign: 'center' } }, { content: slot.slot_type === 'lunch' ? 'Lunch Break' : 'Recess', colSpan: rc1Rooms.length, styles: { halign: 'center', valign: 'middle', fontStyle: 'italic' } }]);
      } else {
        const row: unknown[] = [{ content: timeLabel, styles: { fontStyle: 'bold', valign: 'middle', halign: 'center' } }];
        rc1Rooms.forEach((room) => {
          const r = rc1ScheduleMap[slot.id]?.[room.id];
          if (!r) { row.push('-'); return; }
          const s = r.is_cancelled ? 'cancelled' : (rc1ExecMap[r.id] ?? 'not_marked');
          const lbl = r.is_cancelled ? 'CANCELLED' : (RC1_STATUS_LBL[s] ?? 'Not Marked');
          trackStat(r, s);
          row.push(`${courseLbl(r.course)}\n${r.subject?.subject_name ?? ''}\n${r.assigned_faculty?.full_name ?? ''}\n[${lbl}]`);
        });
        body.push(row);
      }
    });

    if (rc1VirtualEntries.length > 0) {
      const chunkSize = rc1Rooms.length;
      const totalRows = Math.ceil(rc1VirtualEntries.length / chunkSize);
      for (let i = 0; i < rc1VirtualEntries.length; i += chunkSize) {
        const chunk = rc1VirtualEntries.slice(i, i + chunkSize);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const row: any[] = [];
        if (i === 0) row.push({ content: 'VIRTUAL\nLECTURES', rowSpan: totalRows, styles: { fontStyle: 'bold', valign: 'middle', halign: 'center' } });
        for (let j = 0; j < chunkSize; j++) {
          if (j < chunk.length) {
            const r = chunk[j];
            const s = r.is_cancelled ? 'cancelled' : (rc1ExecMap[r.id] ?? 'not_marked');
            const lbl = r.is_cancelled ? 'CANCELLED' : (RC1_STATUS_LBL[s] ?? 'Not Marked');
            trackStat(r, s);
            row.push(`${courseLbl(r.course)}\n${r.subject?.subject_name ?? ''}\n${r.assigned_faculty?.full_name ?? ''}\n[${lbl}]`);
          } else {
            row.push({ content: '-', styles: { halign: 'center', valign: 'middle', textColor: [200, 200, 200] } });
          }
        }
        body.push(row);
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (doc as any).autoTable({
      head, body, startY: 300, theme: 'grid',
      styles: { fontSize: 14, cellPadding: 14, valign: 'middle', halign: 'center', overflow: 'linebreak' },
      headStyles: { fillColor: [26, 34, 68], textColor: 255, fontStyle: 'bold' },
      margin: { top: 300, left: 60, right: 60, bottom: 60 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      didDrawPage(data: any) {
        const cx = pageW / 2;
        doc.setFont('times', 'bold'); doc.setFontSize(42); doc.setTextColor(26, 34, 68);
        doc.text(settings.college_name, cx, 100, { align: 'center' });
        doc.setFont('times', 'normal'); doc.setFontSize(24); doc.setTextColor(50, 60, 90);
        doc.text(settings.college_subtitle, cx, 140, { align: 'center' });
        doc.setFont('times', 'bolditalic'); doc.setFontSize(28);
        doc.text(settings.department_name, cx, 180, { align: 'center' });
        doc.setFont('helvetica', 'bold'); doc.setFontSize(32); doc.setTextColor(26, 34, 68);
        doc.text(`Daily Execution Report — ${dateLabel}`, cx, 240, { align: 'center' });
        doc.setFont('helvetica', 'normal'); doc.setFontSize(14); doc.setTextColor(120);
        doc.text(`Report Generated By: ${generatedBy}`, 60, pageH - 30);
        doc.text(`Page ${data.pageNumber}`, pageW / 2, pageH - 30, { align: 'center' });
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let currentY = (doc as any).lastAutoTable.finalY + 40;

    if (rc1RemarksData.length > 0) {
      if (currentY > pageH - 200) { doc.addPage(); currentY = 60; }
      const remarksBody = rc1RemarksData.map((r) => [`${r.start_time ? r.start_time.slice(0, 5) : ''} - ${r.end_time ? r.end_time.slice(0, 5) : ''}`, r.faculty?.full_name || 'Unknown', r.remark]);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.setTextColor(26, 34, 68);
      doc.text('Faculty Remarks & Extra Activities', 60, currentY);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (doc as any).autoTable({
        head: [['Time', 'Faculty Name', 'Remark / Activity Details']], body: remarksBody, startY: currentY + 20, theme: 'grid',
        styles: { fontSize: 16, cellPadding: 12, valign: 'middle' }, headStyles: { fillColor: [240, 240, 245], textColor: [26, 34, 68], fontStyle: 'bold', fontSize: 18, halign: 'left' },
        columnStyles: { 0: { cellWidth: 200 }, 1: { cellWidth: 350 }, 2: { cellWidth: 'auto' } },
        margin: { left: 60, right: 60, bottom: 60 },
      });
    }

    // ── Page 2: Lecture Taken Report (per-faculty stats for this day) ──
    let ftAllotted = 0, ftTaken = 0, ftLate = 0, ftExtra = 0;
    let visAllotted = 0, visTaken = 0, visLate = 0, visExtra = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ftBody: any[] = [], visBody: any[] = [];
    (facultyList ?? []).forEach((f) => {
      const s = facStats[f.id];
      const extra = Math.max(0, s.taken - s.allotted);
      if (f.faculty_type === 'visiting') {
        visAllotted += s.allotted; visTaken += s.taken; visLate += s.late; visExtra += extra;
        visBody.push([s.name, s.allotted, s.taken, s.late, extra]);
      } else {
        ftAllotted += s.allotted; ftTaken += s.taken; ftLate += s.late; ftExtra += extra;
        ftBody.push([s.name, s.allotted, s.taken, s.late, extra]);
      }
    });
    if (ftBody.length > 0) {
      ftBody.push([
        { content: 'TOTAL (Full-Time)', styles: { fontStyle: 'bold', halign: 'right', fillColor: [240, 240, 245] } },
        { content: ftAllotted.toString(), styles: { fontStyle: 'bold', fillColor: [240, 240, 245] } },
        { content: ftTaken.toString(), styles: { fontStyle: 'bold', fillColor: [240, 240, 245] } },
        { content: ftLate.toString(), styles: { fontStyle: 'bold', fillColor: [240, 240, 245] } },
        { content: ftExtra.toString(), styles: { fontStyle: 'bold', fillColor: [240, 240, 245] } },
      ]);
    }
    if (visBody.length > 0) {
      visBody.push([
        { content: 'TOTAL (Visiting)', styles: { fontStyle: 'bold', halign: 'right', fillColor: [240, 240, 245] } },
        { content: visAllotted.toString(), styles: { fontStyle: 'bold', fillColor: [240, 240, 245] } },
        { content: visTaken.toString(), styles: { fontStyle: 'bold', fillColor: [240, 240, 245] } },
        { content: visLate.toString(), styles: { fontStyle: 'bold', fillColor: [240, 240, 245] } },
        { content: visExtra.toString(), styles: { fontStyle: 'bold', fillColor: [240, 240, 245] } },
      ]);
    }

    doc.addPage();
    const drawnPages = new Set<number>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const drawPage2Header = (data: any) => {
      if (drawnPages.has(data.pageNumber)) return;
      drawnPages.add(data.pageNumber);
      const cx = pageW / 2;
      doc.setFont('times', 'bold'); doc.setFontSize(42); doc.setTextColor(26, 34, 68);
      doc.text(settings.college_name, cx, 100, { align: 'center' });
      doc.setFont('times', 'normal'); doc.setFontSize(24); doc.setTextColor(50, 60, 90);
      doc.text(settings.college_subtitle, cx, 140, { align: 'center' });
      doc.setFont('times', 'bolditalic'); doc.setFontSize(28);
      doc.text(settings.department_name, cx, 180, { align: 'center' });
      doc.setFont('helvetica', 'bold'); doc.setFontSize(32); doc.setTextColor(26, 34, 68);
      doc.text('Lecture Taken Report', cx, 240, { align: 'center' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(22); doc.setTextColor(90, 100, 120);
      doc.text(`Date: ${dateLabel}`, cx, 280, { align: 'center' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(14); doc.setTextColor(120);
      doc.text(`Report Generated By: ${generatedBy}`, 60, pageH - 30);
      doc.text(`Page ${data.pageNumber}`, pageW / 2, pageH - 30, { align: 'center' });
    };

    if (ftBody.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (doc as any).autoTable({
        head: [['Faculty Name (Full-Time)', 'Lec Allotted', 'Lec Taken', 'Late Marked', 'Extra']],
        body: ftBody, startY: 320, theme: 'grid',
        styles: { fontSize: 22, cellPadding: 16, valign: 'middle' },
        headStyles: { fillColor: [26, 34, 68], textColor: 255, fontStyle: 'bold', halign: 'center', fontSize: 24 },
        columnStyles: { 0: { cellWidth: 'auto', halign: 'left' }, 1: { cellWidth: 180, halign: 'center' }, 2: { cellWidth: 180, halign: 'center' }, 3: { cellWidth: 180, halign: 'center' }, 4: { cellWidth: 180, halign: 'center' } },
        margin: { top: 320, left: 120, right: 120, bottom: 70 },
        didDrawPage: drawPage2Header,
      });
    }
    if (visBody.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const finalY = ftBody.length > 0 ? (doc as any).lastAutoTable.finalY + 80 : 320;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (doc as any).autoTable({
        head: [['Faculty Name (Visiting)', 'Lec Allotted', 'Lec Taken', 'Late Marked', 'Extra']],
        body: visBody, startY: finalY, theme: 'grid',
        styles: { fontSize: 22, cellPadding: 16, valign: 'middle' },
        headStyles: { fillColor: [26, 34, 68], textColor: 255, fontStyle: 'bold', halign: 'center', fontSize: 24 },
        columnStyles: { 0: { cellWidth: 'auto', halign: 'left' }, 1: { cellWidth: 180, halign: 'center' }, 2: { cellWidth: 180, halign: 'center' }, 3: { cellWidth: 180, halign: 'center' }, 4: { cellWidth: 180, halign: 'center' } },
        margin: { top: 320, left: 120, right: 120, bottom: 70 },
        didDrawPage: drawPage2Header,
      });
    }

    doc.save(`Daily_Execution_Report_${rc1Date}.pdf`);
  }

  async function runRc2() {
    if (!rc2From || !rc2To) { toast('From and To dates are required.', 'warn'); return; }
    setRc2Loading(true);
    setRc2HasRun(true);
    setRc2Search('');
    try {
      const { data: holRows } = await supabase.from('holidays').select('holiday_date').gte('holiday_date', rc2From).lte('holiday_date', rc2To);
      const holidayDates = new Set((holRows ?? []).map((h) => h.holiday_date));

      const dayCounts: Record<string, number> = { monday: 0, tuesday: 0, wednesday: 0, thursday: 0, friday: 0, saturday: 0 };
      const daysMap = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      // Pure UTC-based date math on the Y-M-D string components — avoids any local-timezone
      // drift that Date-object arithmetic (getDate/setDate/getDay on a locally-parsed date)
      // can introduce.
      const [fy, fm, fd] = rc2From.split('-').map(Number);
      let cursor = Date.UTC(fy, fm - 1, fd);
      const [ty, tm, td] = rc2To.split('-').map(Number);
      const endTime = Date.UTC(ty, tm - 1, td);
      while (cursor <= endTime) {
        const cur = new Date(cursor);
        const dateStr = cur.toISOString().slice(0, 10);
        const dow = cur.getUTCDay();
        if (!holidayDates.has(dateStr) && dow !== 0) dayCounts[daysMap[dow]]++;
        cursor += 24 * 60 * 60 * 1000;
      }

      const { data: facData } = await supabase.from('faculty').select('id, full_name, faculty_type');
      const facMap: Record<string, string> = {};
      const facIdToName: Record<string, string> = {};
      (facData ?? []).forEach((f) => { facMap[f.full_name] = f.faculty_type; facIdToName[f.id] = f.full_name; });

      const { data: masterData, error: masterError } = await supabase.from('master_timetable').select(`
        day_type, course:courses!course_id(id, year, program, division),
        subject:subjects!subject_id(id, subject_name), assigned_faculty:faculty!faculty_id(id, full_name)
      `);
      if (masterError) throw masterError;

      const { data: dailyDataAll, error: dailyError } = await supabase
        .from('daily_schedule')
        .select(
          `id, schedule_date, is_cancelled, is_rescheduled, original_faculty_id, assigned_faculty_id,
           course:courses!course_id(id, year, program, division), subject:subjects!subject_id(id, subject_name),
           assigned_faculty:faculty!assigned_faculty_id(id, full_name), original_faculty:faculty!original_faculty_id(id, full_name),
           csf:course_subject_faculty!csf_id(subject:subjects!subject_id(subject_name))`
        )
        .gte('schedule_date', rc2From)
        .lte('schedule_date', rc2To)
        .eq('is_cancelled', false);
      if (dailyError) throw dailyError;

      const dailyData = ((dailyDataAll ?? []) as Row[]).filter((r) => !holidayDates.has(r.schedule_date));

      let execRows: { daily_schedule_id: string; faculty_status: string }[] = [];
      if (dailyData.length > 0) {
        const { data: ex, error: exErr } = await supabase.from('lecture_execution').select('daily_schedule_id, faculty_status').gte('schedule_date', rc2From).lte('schedule_date', rc2To).limit(50000);
        if (exErr) throw exErr;
        execRows = ex ?? [];
      }
      const execMap: Record<string, string> = {};
      for (const ex of execRows) execMap[ex.daily_schedule_id] = ex.faculty_status;

      const groupMap: Record<string, Row> = {};
      const getCourseKey = (c: Row) => (c ? (c.division ? `${c.year} ${c.program} ${c.division}` : `${c.year} ${c.program}`) : 'Unknown');

      (masterData ?? []).forEach((row: Row) => {
        const courseKey = getCourseKey(row.course);
        const subKey = row.subject?.subject_name ?? 'Unknown';
        const fName = row.assigned_faculty?.full_name ?? '—';
        const key = `${fName}|||${courseKey}|||${subKey}`;
        if (!groupMap[key]) groupMap[key] = { course: courseKey, subject: subKey, faculty: fName, load: 0, scheduled: 0, taken: 0, late: 0 };
        groupMap[key].load += dayCounts[row.day_type] || 0;
      });

      dailyData.forEach((row) => {
        const courseKey = getCourseKey(row.course);
        const origFName = row.original_faculty?.full_name ?? '—';
        const assignFName = row.assigned_faculty?.full_name ?? '—';
        const isReplaced = row.is_rescheduled && row.original_faculty_id && row.assigned_faculty_id && row.original_faculty_id !== row.assigned_faculty_id;
        const exStatus = execMap[row.id];

        if (isReplaced) {
          const origSub = row.subject?.subject_name ?? 'Unknown';
          const origKey = `${origFName}|||${courseKey}|||${origSub}`;
          if (!groupMap[origKey]) groupMap[origKey] = { course: courseKey, subject: origSub, faculty: origFName, load: 0, scheduled: 0, taken: 0, late: 0 };
          groupMap[origKey].scheduled++;

          const newSub = row.csf?.subject?.subject_name ?? row.subject?.subject_name;
          const repKey = `${assignFName}|||${courseKey}|||${newSub}`;
          if (!groupMap[repKey]) groupMap[repKey] = { course: courseKey, subject: newSub, faculty: assignFName, load: 0, scheduled: 0, taken: 0, late: 0 };
          if (exStatus === 'on_time' || exStatus === 'late') { groupMap[repKey].taken++; if (exStatus === 'late') groupMap[repKey].late++; }
        } else {
          const normSub = row.subject?.subject_name ?? 'Unknown';
          const normKey = `${origFName}|||${courseKey}|||${normSub}`;
          if (!groupMap[normKey]) groupMap[normKey] = { course: courseKey, subject: normSub, faculty: origFName, load: 0, scheduled: 0, taken: 0, late: 0 };
          groupMap[normKey].scheduled++;
          if (exStatus === 'on_time' || exStatus === 'late') { groupMap[normKey].taken++; if (exStatus === 'late') groupMap[normKey].late++; }
        }
      });

      const selNames = rc2FacultyIds.map((id) => facIdToName[id]);
      const result = Object.values(groupMap)
        .map((g: Row) => ({ ...g, extra: Math.max(0, g.taken - g.scheduled), facType: facMap[g.faculty] || 'fulltime' }))
        .filter((g: Row) => {
          if (rc2Type !== 'all' && g.facType !== rc2Type) return false;
          if (selNames.length > 0 && !selNames.includes(g.faculty)) return false;
          if (g.load === 0 && g.scheduled === 0 && g.taken === 0) return false;
          return true;
        })
        .sort((a: Row, b: Row) => a.faculty.localeCompare(b.faculty) || a.course.localeCompare(b.course));

      setRc2Data(result);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setRc2Loading(false);
    }
  }
  function rc2RowsWithSubtotals(dataArray: Row[]) {
    const out: Row[] = [];
    if (!dataArray.length) return out;
    let currentFaculty = dataArray[0].faculty;
    let s = { load: 0, sched: 0, taken: 0, late: 0, extra: 0 };
    const g = { load: 0, sched: 0, taken: 0, late: 0, extra: 0 };
    const pushSubtotal = (facName: string) => out.push({ isSubtotal: true, faculty: facName, ...s });
    dataArray.forEach((r, idx) => {
      if (r.faculty !== currentFaculty) { pushSubtotal(currentFaculty); s = { load: 0, sched: 0, taken: 0, late: 0, extra: 0 }; currentFaculty = r.faculty; }
      s.load += r.load; s.sched += r.scheduled; s.taken += r.taken; s.late += r.late; s.extra += r.extra;
      g.load += r.load; g.sched += r.scheduled; g.taken += r.taken; g.late += r.late; g.extra += r.extra;
      out.push({ isSubtotal: false, ...r });
      if (idx === dataArray.length - 1) pushSubtotal(currentFaculty);
    });
    out.push({ isGrandTotal: true, ...g });
    return out;
  }
  function rc2SearchFilter(dataArray: Row[]) {
    if (!rc2Search) return dataArray;
    const q = rc2Search.toLowerCase();
    return dataArray.filter((r) => `${r.course} ${r.subject} ${r.faculty}`.toLowerCase().includes(q));
  }
  async function rc2ExportExcel() {
    if (!rc2Data.length) { toast('Run report first.', 'warn'); return; }
    const XLSX = await import('xlsx');
    const ftData = rc2Data.filter((d) => d.facType !== 'visiting');
    const visData = rc2Data.filter((d) => d.facType === 'visiting');
    function toExcelRows(dataArray: Row[], typeLabel: string) {
      const rows = rc2RowsWithSubtotals(dataArray);
      return rows.map((r) => {
        if (r.isGrandTotal) return { type: '', course: 'GRAND TOTAL:', subject: '', load: r.load, faculty: '', scheduled: r.sched, taken: r.taken, late: r.late, extra: r.extra };
        if (r.isSubtotal) return { type: '', course: `Total for ${r.faculty}:`, subject: '', load: r.load, faculty: '', scheduled: r.sched, taken: r.taken, late: r.late, extra: r.extra };
        return { type: typeLabel, course: r.course, subject: r.subject, load: r.load, faculty: r.faculty, scheduled: r.scheduled, taken: r.taken, late: r.late, extra: r.extra };
      });
    }
    const excelData = [...toExcelRows(ftData, 'Full-Time'), ...toExcelRows(visData, 'Visiting')];
    const headers = [
      { header: 'Faculty Type', key: 'type' }, { header: 'Class', key: 'course' }, { header: 'Subject', key: 'subject' },
      { header: 'Load', key: 'load' }, { header: 'Teacher Name', key: 'faculty' }, { header: 'Scheduled', key: 'scheduled' },
      { header: 'Lec Taken', key: 'taken' }, { header: 'Late', key: 'late' }, { header: 'Extra', key: 'extra' },
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers.map((h) => h.header), ...excelData.map((r) => headers.map((h) => (r as Record<string, unknown>)[h.key] ?? ''))]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Lecture Taken');
    XLSX.writeFile(wb, 'Lecture_Taken_Report.xlsx');
  }
  async function rc2ExportPdf() {
    if (!rc2Data.length) { toast('Run report first.', 'warn'); return; }
    const settings = await getAppSettings();
    const { jsPDF } = await import('jspdf');
    await import('jspdf-autotable');
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.width;
    const pageH = doc.internal.pageSize.height;
    const subtitle = `Period: ${fmtDate(rc2From)} to ${fmtDate(rc2To)}`;
    const head = [['Class', 'Subject', 'Teacher Name', 'Scheduled', 'Lec Taken', 'Late', 'Extra']];
    function pdfBody(dataArray: Row[]) {
      const rows = rc2RowsWithSubtotals(dataArray);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return rows.map((r): any => {
        if (r.isGrandTotal) return [
          { content: 'GRAND TOTAL:', colSpan: 2, styles: { halign: 'right', fontStyle: 'bold', fillColor: [220, 225, 240], textColor: [26, 34, 68] } },
          { content: r.load.toString(), styles: { halign: 'center', fontStyle: 'bold', fillColor: [220, 225, 240] } },
          { content: r.sched.toString(), styles: { halign: 'center', fontStyle: 'bold', fillColor: [220, 225, 240] } },
          { content: r.taken.toString(), styles: { halign: 'center', fontStyle: 'bold', fillColor: [220, 225, 240] } },
          { content: r.late.toString(), styles: { halign: 'center', fontStyle: 'bold', fillColor: [220, 225, 240] } },
          { content: r.extra.toString(), styles: { halign: 'center', fontStyle: 'bold', fillColor: [220, 225, 240] } },
        ];
        if (r.isSubtotal) return [
          { content: `Total for ${r.faculty}:`, colSpan: 3, styles: { halign: 'right', fontStyle: 'bold', fillColor: [240, 240, 245] } },
          { content: r.sched.toString(), styles: { halign: 'center', fontStyle: 'bold', fillColor: [240, 240, 245] } },
          { content: r.taken.toString(), styles: { halign: 'center', fontStyle: 'bold', fillColor: [240, 240, 245] } },
          { content: r.late.toString(), styles: { halign: 'center', fontStyle: 'bold', fillColor: [240, 240, 245] } },
          { content: r.extra.toString(), styles: { halign: 'center', fontStyle: 'bold', fillColor: [240, 240, 245] } },
        ];
        return [r.course, r.subject, r.faculty, r.scheduled.toString(), r.taken.toString(), r.late.toString(), r.extra.toString()];
      });
    }
    const drawHeader = (data: { pageNumber: number }) => {
      const cx = pageW / 2;
      doc.setFont('times', 'bold'); doc.setFontSize(15); doc.setTextColor(26, 34, 68);
      doc.text(settings.college_name, cx, 15, { align: 'center' });
      doc.setFont('times', 'normal'); doc.setFontSize(10); doc.setTextColor(50, 60, 90);
      doc.text(settings.college_subtitle, cx, 20, { align: 'center' });
      doc.setFont('times', 'bolditalic'); doc.setFontSize(10);
      doc.text(settings.department_name, cx, 25, { align: 'center' });
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(26, 34, 68);
      doc.text('Lecture Taken Report', cx, 34, { align: 'center' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90, 100, 120);
      doc.text(subtitle, cx, 40, { align: 'center' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(80);
      doc.text(`Report Generated By: ${generatedBy}`, 14, pageH - 9);
      doc.text(`Report Generated On: ${new Date().toLocaleString('en-IN')}`, 14, pageH - 4.5);
      doc.setTextColor(150);
      doc.text(`Page ${data.pageNumber}`, pageW / 2, pageH - 4.5, { align: 'center' });
    };
    const ftData = rc2Data.filter((d) => d.facType !== 'visiting');
    const visData = rc2Data.filter((d) => d.facType === 'visiting');
    let currentY = 52;
    if (ftData.length > 0) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(26, 34, 68);
      doc.text('Full-Time Faculty', 14, currentY);
      currentY += 4;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (doc as any).autoTable({
        head, body: pdfBody(ftData), startY: currentY, margin: { top: 52, left: 14, right: 14, bottom: 20 }, theme: 'grid',
        styles: { fontSize: 7.5, cellPadding: 2, valign: 'middle' }, headStyles: { fillColor: [26, 34, 68], textColor: 255, fontStyle: 'bold' },
        columnStyles: { 0: { cellWidth: 26 }, 1: { cellWidth: 42 }, 2: { cellWidth: 'auto' }, 3: { cellWidth: 18, halign: 'center' }, 4: { cellWidth: 18, halign: 'center' }, 5: { cellWidth: 12, halign: 'center' }, 6: { cellWidth: 12, halign: 'center' } },
        didDrawPage: drawHeader,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      currentY = (doc as any).lastAutoTable.finalY + 15;
    }
    if (visData.length > 0) {
      if (currentY + 20 > pageH) { doc.addPage(); currentY = 52; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(26, 34, 68);
      doc.text('Visiting Faculty', 14, currentY);
      currentY += 4;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (doc as any).autoTable({
        head, body: pdfBody(visData), startY: currentY, margin: { top: 52, left: 14, right: 14, bottom: 20 }, theme: 'grid',
        styles: { fontSize: 7.5, cellPadding: 2, valign: 'middle' }, headStyles: { fillColor: [26, 34, 68], textColor: 255, fontStyle: 'bold' },
        columnStyles: { 0: { cellWidth: 26 }, 1: { cellWidth: 42 }, 2: { cellWidth: 'auto' }, 3: { cellWidth: 18, halign: 'center' }, 4: { cellWidth: 18, halign: 'center' }, 5: { cellWidth: 12, halign: 'center' }, 6: { cellWidth: 12, halign: 'center' } },
        didDrawPage: drawHeader,
      });
    }
    doc.save('Lecture_Taken_Report.pdf');
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-subtitle">Analyse lecture execution, attendance, leaves, and modifications</p>
        </div>
      </div>

      <div className="content">
        <div className="report-layout">
          <div className="report-nav">
            {NAV_GROUPS.map((g) => (
              <div key={g.label}>
                <div className="report-nav-label">{g.label}</div>
                {g.items.map((i) => (
                  <button key={i.key} className={`report-nav-btn${activeReport === i.key ? ' active' : ''}`} onClick={() => setActiveReport(i.key)}>
                    {i.label}
                  </button>
                ))}
              </div>
            ))}
          </div>

          <div className="report-panel">
            {activeReport === 'r1' && (
              <div className="report-section active">
                <div className="report-header">
                  <div className="report-title">Daily Summary</div>
                  <div className="export-btns">
                    <input type="text" className="table-search" placeholder="🔍 Search table..." value={r1Search} onChange={(e) => setR1Search(e.target.value)} />
                    <button className="btn btn-ghost btn-sm" onClick={r1ExportPdf}>PDF</button>
                    <button className="btn btn-ghost btn-sm" onClick={r1ExportXls}>Excel</button>
                  </div>
                </div>
                <div className="filter-card">
                  <div className="field"><label>Date</label><input type="text" id="r1Date" placeholder="Pick date" readOnly /></div>
                  <button className="btn btn-primary btn-sm" onClick={runR1}>Run Report</button>
                </div>
                {r1Stats && (
                  <div className="stat-chips">
                    {([
                      ['On Time', r1Stats.on_time, 'chip-green', 'green'],
                      ['Late', r1Stats.late, 'chip-amber', 'amber'],
                      ['Not Engaged', r1Stats.not_engaged, 'chip-red', 'red'],
                      ['Not Marked', r1Stats.not_marked, 'chip-grey', 'grey'],
                      ['Modified', r1Stats.modified, 'chip-blue', 'blue'],
                      ['Cancelled', r1Stats.cancelled, 'chip-grey', 'grey'],
                    ] as [string, number, string, string][]).map(([lbl, val, chip, col]) => (
                      <div className={`stat-chip ${chip}`} key={lbl}>
                        <div className="stat-chip-label">{lbl}</div>
                        <div className={`stat-chip-value ${col}`}>{val}</div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="result-count">{r1HasRun && !r1Loading ? `${r1Data.length} lecture slots found` : ''}</div>
                <ReportTable columns={r1Columns} rows={r1Data} search={r1Search} loading={r1Loading} emptyMessage={r1HasRun ? 'No schedule found for this date.' : 'Select a date and run report.'} rowKey={(r) => r.id} />
              </div>
            )}

            {activeReport === 'r2' && (
              <div className="report-section active">
                <div className="report-header">
                  <div className="report-title">Faculty Lectures</div>
                  <div className="export-btns">
                    <input type="text" className="table-search" placeholder="🔍 Search table..." value={r2Search} onChange={(e) => setR2Search(e.target.value)} />
                    <button className="btn btn-ghost btn-sm" onClick={() => r2Export('pdf')}>PDF</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => r2Export('xls')}>Excel</button>
                  </div>
                </div>
                <div className="filter-card">
                  <div className="field"><label>Faculty</label>{!dropdownsLoading && <TomSelectField options={facultyOptions} value={r2Faculty} onChange={setR2Faculty} placeholder="All Faculty" allowEmptyOption />}</div>
                  <div className="field"><label>From</label><input type="text" id="r2From" placeholder="From" readOnly /></div>
                  <div className="field"><label>To</label><input type="text" id="r2To" placeholder="To" readOnly /></div>
                  <div className="field">
                    <label>Status</label>
                    <select value={r2Status} onChange={(e) => setR2Status(e.target.value)}>
                      <option value="">All</option><option value="on_time">On Time</option><option value="late">Late</option><option value="not_engaged">Not Engaged</option><option value="not_marked">Not Marked</option>
                    </select>
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={runR2}>Run</button>
                </div>
                {r2HasRun && (
                  <div className="mini-stats">
                    <div className="mini-stat"><div className="mini-stat-val" style={{ color: 'var(--success)' }}>{r2MiniStats.onTime}</div><div className="mini-stat-lbl">On Time</div></div>
                    <div className="mini-stat"><div className="mini-stat-val" style={{ color: 'var(--warn)' }}>{r2MiniStats.late}</div><div className="mini-stat-lbl">Late</div></div>
                    <div className="mini-stat"><div className="mini-stat-val" style={{ color: 'var(--error)' }}>{r2MiniStats.notEngaged}</div><div className="mini-stat-lbl">Not Engaged</div></div>
                    <div className="mini-stat"><div className="mini-stat-val" style={{ color: 'var(--text-muted)' }}>{r2MiniStats.notMarked}</div><div className="mini-stat-lbl">Not Marked</div></div>
                  </div>
                )}
                <div className="result-count">{r2HasRun && !r2Loading ? `${r2Data.length} records found` : ''}</div>
                <ReportTable columns={r2Columns} rows={r2Data} search={r2Search} loading={r2Loading} emptyMessage={r2HasRun ? 'No records found.' : 'Set filters and run.'} rowKey={(r) => r.id} />
              </div>
            )}

            {activeReport === 'r8' && (
              <div className="report-section active">
                <div className="report-header">
                  <div className="report-title">Not Engaged / Not Marked</div>
                  <div className="export-btns">
                    <input type="text" className="table-search" placeholder="🔍 Search table..." value={r8Search} onChange={(e) => setR8Search(e.target.value)} />
                    <button className="btn btn-ghost btn-sm" onClick={() => r8Export('pdf')}>PDF</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => r8Export('xls')}>Excel</button>
                  </div>
                </div>
                <div className="filter-card">
                  <div className="field"><label>From</label><input type="text" id="r8From" readOnly /></div>
                  <div className="field"><label>To</label><input type="text" id="r8To" readOnly /></div>
                  <div className="field"><label>Faculty</label>{!dropdownsLoading && <TomSelectField options={facultyOptions} value={r8Faculty} onChange={setR8Faculty} placeholder="All" allowEmptyOption />}</div>
                  <div className="field"><label>Course</label>{!dropdownsLoading && <TomSelectField options={courseOptions} value={r8Course} onChange={setR8Course} placeholder="All" allowEmptyOption />}</div>
                  <div className="field">
                    <label>Status</label>
                    <select value={r8Status} onChange={(e) => setR8Status(e.target.value)}>
                      <option value="">Both</option><option value="not_engaged">Not Engaged only</option><option value="not_marked">Not Marked only</option>
                    </select>
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={runR8}>Run</button>
                </div>
                <div className="result-count">{r8HasRun && !r8Loading ? `${r8Data.length} records found` : ''}</div>
                <ReportTable columns={r8Columns} rows={r8Data} search={r8Search} loading={r8Loading} emptyMessage={r8HasRun ? 'No records found.' : 'Set filters and run.'} rowKey={(r) => r.id} />
              </div>
            )}

            {activeReport === 'rc1' && (
              <div className="report-section active">
                <div className="report-header">
                  <div className="report-title">Daily Execution Report</div>
                  <div className="export-btns">
                    <button className="btn btn-ghost btn-sm" onClick={rc1ExportPdf}>PDF</button>
                  </div>
                </div>
                <div className="filter-card">
                  <div className="field"><label>Date</label><input type="text" id="rc1Date" placeholder="Pick date" readOnly /></div>
                  <button className="btn btn-primary btn-sm" onClick={runRc1}>Run Report</button>
                </div>
                {rc1HasRun && !rc1Loading && rc1Slots.length > 0 && (
                  <div className="mini-stats">
                    <div className="mini-stat"><div className="mini-stat-val" style={{ color: 'var(--success)' }}>{rc1Stats.onTime}</div><div className="mini-stat-lbl">On Time</div></div>
                    <div className="mini-stat"><div className="mini-stat-val" style={{ color: 'var(--warn)' }}>{rc1Stats.late}</div><div className="mini-stat-lbl">Late</div></div>
                    <div className="mini-stat"><div className="mini-stat-val" style={{ color: 'var(--error)' }}>{rc1Stats.notEngaged}</div><div className="mini-stat-lbl">Not Engaged</div></div>
                    <div className="mini-stat"><div className="mini-stat-val" style={{ color: 'var(--text-muted)' }}>{rc1Stats.notMarked}</div><div className="mini-stat-lbl">Not Marked</div></div>
                    <div className="mini-stat"><div className="mini-stat-val" style={{ color: 'var(--border)' }}>{rc1Stats.cancelled}</div><div className="mini-stat-lbl">Cancelled</div></div>
                  </div>
                )}
                {!rc1HasRun ? (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Select a date and run report.</div>
                ) : rc1Loading ? (
                  <div style={{ padding: '2rem', textAlign: 'center' }}><span className="spin" /></div>
                ) : !rc1Slots.length || !rc1Rooms.length ? (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No data found for this date.</div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', minWidth: 86 + rc1Rooms.length * 108 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: `86px repeat(${rc1Rooms.length},minmax(108px,1fr))`, borderBottom: '1px solid var(--border)', background: 'rgba(26,34,68,.06)' }}>
                        <div style={{ padding: '.55rem .65rem', fontSize: '.64rem', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-muted)', borderRight: '1px solid var(--border)' }}>Time</div>
                        {rc1Rooms.map((r) => <div key={r.id} style={{ padding: '.55rem .65rem', fontSize: '.64rem', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-muted)', borderRight: '1px solid var(--border)' }}>Room {r.room_code}</div>)}
                      </div>
                      {rc1Slots.map((slot) => {
                        const isB = slot.slot_type !== 'lecture';
                        return (
                          <div key={slot.id} style={{ display: 'grid', gridTemplateColumns: `86px repeat(${rc1Rooms.length},minmax(108px,1fr))`, borderBottom: '1px solid rgba(200,210,230,.35)', background: isB ? 'var(--bg-input)' : undefined }}>
                            <div style={{ padding: '.4rem .6rem', fontSize: '.68rem', color: 'var(--text-muted)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                              <span style={{ fontWeight: 700, fontSize: '.7rem', color: 'var(--text-label)' }}>{slot.slot_label ?? ''}</span>
                              <span style={{ fontSize: '.63rem' }}>{slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)}</span>
                            </div>
                            {isB ? (
                              <div style={{ padding: '.35rem .65rem', fontSize: '.7rem', fontStyle: 'italic', color: 'var(--text-muted)', gridColumn: `2/${rc1Rooms.length + 2}`, display: 'flex', alignItems: 'center' }}>{slot.slot_type === 'lunch' ? '🍽 Lunch' : '☕ Recess'}</div>
                            ) : (
                              rc1Rooms.map((room) => <div key={room.id}>{rc1Cell(rc1ScheduleMap[slot.id]?.[room.id])}</div>)
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {rc1HasRun && !rc1Loading && rc1VirtualEntries.length > 0 && (
                  <div className="virtual-section" style={{ display: 'block', marginTop: '1.25rem' }}>
                    <div className="virtual-header">Virtual lecture</div>
                    <div className="virtual-grid">{rc1VirtualEntries.map((row) => <div key={row.id} className="virtual-cell filled">{rc1Cell(row)}</div>)}</div>
                  </div>
                )}
                {rc1HasRun && !rc1Loading && rc1RemarksData.length > 0 && (
                  <div className="remarks-section" style={{ display: 'block', marginTop: '1.25rem' }}>
                    <div className="remarks-header"><div>Faculty Remarks &amp; Extra Activities</div></div>
                    <div className="remarks-grid">
                      {rc1RemarksData.map((r) => (
                        <div className="remark-card" key={r.id}>
                          <div className="rm-fac">{r.faculty?.full_name || 'Unknown Faculty'}</div>
                          <div className="rm-time">{r.start_time ? r.start_time.slice(0, 5) : '--:--'} - {r.end_time ? r.end_time.slice(0, 5) : '--:--'}</div>
                          <div className="rm-text">{r.remark}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeReport === 'rc2' && (
              <div className="report-section active">
                <div className="report-header">
                  <div className="report-title">Lecture Taken Report</div>
                  <div className="export-btns">
                    <input type="text" className="table-search" placeholder="🔍 Search records..." value={rc2Search} onChange={(e) => setRc2Search(e.target.value)} />
                    <button className="btn btn-ghost btn-sm" onClick={rc2ExportPdf}>PDF</button>
                    <button className="btn btn-ghost btn-sm" onClick={rc2ExportExcel}>Excel</button>
                  </div>
                </div>
                <div className="filter-card">
                  <div className="field"><label>From Date *</label><input type="text" id="rc2From" placeholder="From" readOnly /></div>
                  <div className="field"><label>To Date *</label><input type="text" id="rc2To" placeholder="To" readOnly /></div>
                  <div className="field">
                    <label>Faculty Type</label>
                    <select value={rc2Type} onChange={(e) => setRc2Type(e.target.value)}>
                      <option value="all">All Types</option><option value="fulltime">Full-Time</option><option value="visiting">Visiting</option>
                    </select>
                  </div>
                  <div className="field" style={{ flex: 2, minWidth: 250 }}>
                    <label>Select Faculty</label>
                    {!dropdownsLoading && <TomSelectMulti options={facultyOptions} value={rc2FacultyIds} onChange={setRc2FacultyIds} placeholder="All Faculty (Select to filter)" />}
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={runRc2} disabled={rc2Loading}>{rc2Loading ? 'Running…' : 'Run Report'}</button>
                </div>
                <div className="result-count">{rc2HasRun && !rc2Loading ? `${rc2Data.length} active class rows found` : ''}</div>
                <div style={{ overflowX: 'auto' }}>
                  {!rc2HasRun ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Set date range and run report.</div>
                  ) : rc2Loading ? (
                    <div style={{ padding: '2rem', textAlign: 'center' }}><span className="spin" /></div>
                  ) : rc2Data.length === 0 ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No data found for these filters.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                      {(() => {
                        const ftData = rc2SearchFilter(rc2Data.filter((d) => d.facType !== 'visiting'));
                        const visData = rc2SearchFilter(rc2Data.filter((d) => d.facType === 'visiting'));
                        const renderTable = (dataArray: Row[], title: string) => {
                          if (!dataArray.length) return null;
                          const withTotals = rc2RowsWithSubtotals(dataArray);
                          return (
                            <div key={title}>
                              <h3 style={{ marginBottom: '0.5rem', fontSize: '1.1rem', color: 'var(--text-primary)' }}>{title}</h3>
                              <div className="table-wrap">
                                <table>
                                  <thead><tr><th>Class</th><th>Subject</th><th>Load</th><th>Teacher Name</th><th>Scheduled</th><th>Lec Taken</th><th>Late</th><th>Extra</th></tr></thead>
                                  <tbody>
                                    {withTotals.map((r, i) =>
                                      r.isGrandTotal ? (
                                        <tr key={i} style={{ background: 'rgba(79, 106, 245, 0.08)', borderTop: '2px solid var(--border)', fontWeight: 800 }}>
                                          <td colSpan={2} style={{ textAlign: 'right', color: 'var(--accent)' }}>GRAND TOTAL:</td>
                                          <td style={{ textAlign: 'center', color: 'var(--accent)' }}>{r.load}</td><td></td>
                                          <td style={{ textAlign: 'center', color: 'var(--accent)' }}>{r.sched}</td>
                                          <td style={{ textAlign: 'center', color: 'var(--success)' }}>{r.taken}</td>
                                          <td style={{ textAlign: 'center', color: 'var(--warn)' }}>{r.late}</td>
                                          <td style={{ textAlign: 'center', color: 'var(--accent)' }}>{r.extra}</td>
                                        </tr>
                                      ) : r.isSubtotal ? (
                                        <tr key={i} style={{ background: 'var(--bg-hover)', fontWeight: 700 }}>
                                          <td colSpan={2} style={{ textAlign: 'right' }}>Total for {r.faculty}:</td>
                                          <td style={{ textAlign: 'center' }}>{r.load}</td><td></td>
                                          <td style={{ textAlign: 'center' }}>{r.sched}</td>
                                          <td style={{ textAlign: 'center', color: 'var(--success)' }}>{r.taken}</td>
                                          <td style={{ textAlign: 'center', color: r.late > 0 ? 'var(--warn)' : 'inherit' }}>{r.late}</td>
                                          <td style={{ textAlign: 'center', color: r.extra > 0 ? 'var(--accent)' : 'inherit' }}>{r.extra}</td>
                                        </tr>
                                      ) : (
                                        <tr key={i}>
                                          <td><strong>{r.course}</strong></td>
                                          <td>{r.subject}</td>
                                          <td style={{ textAlign: 'center', fontWeight: 600 }}>{r.load}</td>
                                          <td>{r.faculty}</td>
                                          <td style={{ textAlign: 'center', fontWeight: 600 }}>{r.scheduled}</td>
                                          <td style={{ textAlign: 'center', color: 'var(--success)', fontWeight: 600 }}>{r.taken}</td>
                                          <td style={{ textAlign: 'center', color: r.late > 0 ? 'var(--warn)' : 'var(--text-muted)', fontWeight: 600 }}>{r.late}</td>
                                          <td style={{ textAlign: 'center', color: r.extra > 0 ? 'var(--accent)' : 'var(--text-muted)', fontWeight: 600 }}>{r.extra}</td>
                                        </tr>
                                      )
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          );
                        };
                        return (<>{renderTable(ftData, 'Full-Time Faculty')}{renderTable(visData, 'Visiting Faculty')}</>);
                      })()}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeReport === 'r4' && (
              <div className="report-section active">
                <div className="report-header">
                  <div className="report-title">By Course</div>
                  <div className="export-btns">
                    <input type="text" className="table-search" placeholder="🔍 Search table..." value={r4Search} onChange={(e) => setR4Search(e.target.value)} />
                    <button className="btn btn-ghost btn-sm" onClick={() => r4Export('pdf')}>PDF</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => r4Export('xls')}>Excel</button>
                  </div>
                </div>
                <div className="filter-card">
                  <div className="field"><label>Course *</label>{!dropdownsLoading && <TomSelectField options={courseOptions} value={r4Course} onChange={setR4Course} placeholder="— select course —" allowEmptyOption />}</div>
                  <div className="field"><label>From</label><input type="text" id="r4From" readOnly /></div>
                  <div className="field"><label>To</label><input type="text" id="r4To" readOnly /></div>
                  <div className="field">
                    <label>Status</label>
                    <select value={r4Status} onChange={(e) => setR4Status(e.target.value)}>
                      <option value="">All</option><option value="on_time">On Time</option><option value="late">Late</option><option value="not_engaged">Not Engaged</option><option value="not_marked">Not Marked</option>
                    </select>
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={runR4}>Run</button>
                </div>
                <div className="result-count">{r4HasRun && !r4Loading ? `${r4Data.length} records found` : ''}</div>
                <ReportTable columns={r4Columns} rows={r4Data} search={r4Search} loading={r4Loading} emptyMessage={r4HasRun ? 'No records.' : 'Select course and run.'} rowKey={(r) => r.id} />
              </div>
            )}

            {activeReport === 'r5' && (
              <div className="report-section active">
                <div className="report-header">
                  <div className="report-title">By Subject</div>
                  <div className="export-btns">
                    <input type="text" className="table-search" placeholder="🔍 Search table..." value={r5Search} onChange={(e) => setR5Search(e.target.value)} />
                    <button className="btn btn-ghost btn-sm" onClick={() => r5Export('pdf')}>PDF</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => r5Export('xls')}>Excel</button>
                  </div>
                </div>
                <div className="filter-card">
                  <div className="field"><label>Subject *</label>{!dropdownsLoading && <TomSelectField options={subjectOptions} value={r5Subject} onChange={setR5Subject} placeholder="— select subject —" allowEmptyOption />}</div>
                  <div className="field"><label>From</label><input type="text" id="r5From" readOnly /></div>
                  <div className="field"><label>To</label><input type="text" id="r5To" readOnly /></div>
                  <div className="field"><label>Faculty</label>{!dropdownsLoading && <TomSelectField options={facultyOptions} value={r5Faculty} onChange={setR5Faculty} placeholder="All" allowEmptyOption />}</div>
                  <div className="field">
                    <label>Status</label>
                    <select value={r5Status} onChange={(e) => setR5Status(e.target.value)}>
                      <option value="">All</option><option value="on_time">On Time</option><option value="late">Late</option><option value="not_engaged">Not Engaged</option><option value="not_marked">Not Marked</option>
                    </select>
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={runR5}>Run</button>
                </div>
                <div className="result-count">{r5HasRun && !r5Loading ? `${r5Data.length} records found` : ''}</div>
                <ReportTable columns={r5Columns} rows={r5Data} search={r5Search} loading={r5Loading} emptyMessage={r5HasRun ? 'No records.' : 'Select subject and run.'} rowKey={(r) => r.id} />
              </div>
            )}

            {activeReport === 'r6' && (
              <div className="report-section active">
                <div className="report-header">
                  <div className="report-title">By Room</div>
                  <div className="export-btns">
                    <input type="text" className="table-search" placeholder="🔍 Search table..." value={r6Search} onChange={(e) => setR6Search(e.target.value)} />
                    <button className="btn btn-ghost btn-sm" onClick={() => r6Export('pdf')}>PDF</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => r6Export('xls')}>Excel</button>
                  </div>
                </div>
                <div className="filter-card">
                  <div className="field"><label>Room *</label>{!dropdownsLoading && <TomSelectField options={roomOptions} value={r6Room} onChange={setR6Room} placeholder="— select room —" allowEmptyOption />}</div>
                  <div className="field"><label>From</label><input type="text" id="r6From" readOnly /></div>
                  <div className="field"><label>To</label><input type="text" id="r6To" readOnly /></div>
                  <button className="btn btn-primary btn-sm" onClick={runR6}>Run</button>
                </div>
                <div className="result-count">{r6HasRun && !r6Loading ? `${r6Data.length} records found` : ''}</div>
                <ReportTable columns={r6Columns} rows={r6Data} search={r6Search} loading={r6Loading} emptyMessage={r6HasRun ? 'No records.' : 'Select room and run.'} rowKey={(r) => r.id} />
              </div>
            )}

            {activeReport === 'r9' && (
              <div className="report-section active">
                <div className="report-header">
                  <div className="report-title">Rescheduled Slots</div>
                  <div className="export-btns">
                    <input type="text" className="table-search" placeholder="🔍 Search table..." value={r9Search} onChange={(e) => setR9Search(e.target.value)} />
                    <button className="btn btn-ghost btn-sm" onClick={() => r9Export('pdf')}>PDF</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => r9Export('xls')}>Excel</button>
                  </div>
                </div>
                <div className="filter-card">
                  <div className="field"><label>From</label><input type="text" id="r9From" readOnly /></div>
                  <div className="field"><label>To</label><input type="text" id="r9To" readOnly /></div>
                  <button className="btn btn-primary btn-sm" onClick={runR9}>Run</button>
                </div>
                <div className="result-count">{r9HasRun && !r9Loading ? `${r9Data.length} rescheduled slots found` : ''}</div>
                <ReportTable columns={r9Columns} rows={r9Data} search={r9Search} loading={r9Loading} emptyMessage={r9HasRun ? 'No rescheduled slots found.' : 'Set date range and run.'} rowKey={(r) => r.id} />
              </div>
            )}

            {activeReport === 'r3' && (
              <div className="report-section active">
                <div className="report-header">
                  <div className="report-title">Faculty Leave Summary</div>
                  <div className="export-btns">
                    <input type="text" className="table-search" placeholder="🔍 Search table..." value={r3Search} onChange={(e) => setR3Search(e.target.value)} />
                    <button className="btn btn-ghost btn-sm" onClick={r3ExportPdf}>PDF</button>
                    <button className="btn btn-ghost btn-sm" onClick={r3ExportXls}>Excel</button>
                  </div>
                </div>
                <div className="filter-card">
                  <div className="field"><label>Faculty</label>{!dropdownsLoading && <TomSelectField options={facultyOptions} value={r3Faculty} onChange={setR3Faculty} placeholder="All Faculty" allowEmptyOption />}</div>
                  <div className="field"><label>From</label><input type="text" id="r3From" readOnly /></div>
                  <div className="field"><label>To</label><input type="text" id="r3To" readOnly /></div>
                  <button className="btn btn-primary btn-sm" onClick={runR3}>Run</button>
                </div>
                <div className="result-count">{r3HasRun && !r3Loading ? `${r3Data.length} leave records found` : ''}</div>
                <ReportTable columns={r3Columns} rows={r3Data} search={r3Search} loading={r3Loading} emptyMessage={r3HasRun ? 'No leave records found.' : 'Set filters and run.'} rowKey={(r) => r.id} />
                {r3Summary.length > 0 && (
                  <div style={{ marginTop: '1rem' }}>
                    {r3Summary.map((s, i) => (
                      <div key={i} style={{ marginBottom: '.85rem' }}>
                        <div style={{ fontWeight: 600, fontSize: '.88rem', marginBottom: '.4rem' }}>{s.faculty.full_name} — {s.total} day(s)</div>
                        <div className="leave-summary-grid">
                          {Object.entries(s.counts as Record<string, number>).map(([type, cnt]) => (
                            <div className="leave-type-chip" key={type}>{LEAVE_TYPE_LABELS[type] ?? type}<strong>{cnt}</strong></div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <ToastContainer toasts={toasts} />
    </>
  );
}
