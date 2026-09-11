import { createClient } from '@/lib/supabase/client';

export interface ReportFilters {
  fromDate?: string | null;
  toDate?: string | null;
  facultyId?: string | null;
  faculty_status?: string | null;
  isModified?: boolean;
  isReplaced?: boolean;
  isTimeChanged?: boolean;
  isRoomChanged?: boolean;
  courseId?: string | null;
  subjectId?: string | null;
  roomId?: string | null;
}

const EXEC_SELECT = `
  id,
  schedule_date,
  faculty_status,
  is_time_changed,
  is_room_changed,
  is_replaced,
  is_modified,
  actual_start_time,
  actual_end_time,
  modification_note,
  remarks,
  marked_at,
  actual_faculty:faculty!actual_faculty_id       (id, full_name, employee_code),
  replacement_faculty:faculty!replacement_faculty_id (id, full_name),
  actual_room:rooms!actual_room_id               (id, room_code),
  daily_schedule:daily_schedule!daily_schedule_id (
    id, schedule_date, is_cancelled, is_rescheduled,
    course:courses!course_id   (id, course_code, year, program, division),
    subject:subjects!subject_id (id, subject_name),
    room:rooms!room_id          (id, room_code),
    time_slot:time_slots!time_slot_id (id, start_time, end_time, slot_label, sort_order),
    assigned_faculty:faculty!assigned_faculty_id (id, full_name),
    original_faculty:faculty!original_faculty_id (id, full_name)
  )
`;

/**
 * Master query for lecture execution reports (r2, r4, r5, r6, r8).
 * Ported 1:1 from js/modules/reports.js's getFilteredReport, including
 * the "dual-faculty" and "dual-status" client-side filtering logic for
 * replaced lectures (one lecture, two faculty, two effective statuses).
 */
export async function getFilteredReport(
  filters: ReportFilters = {},
  role: 'admin' | 'faculty' = 'admin',
  myFacultyId: string | null = null
) {
  if (role === 'faculty') {
    filters = { ...filters, facultyId: myFacultyId };
  }

  const supabase = createClient();
  let q = supabase.from('lecture_execution').select(EXEC_SELECT);

  if (filters.fromDate) q = q.gte('schedule_date', filters.fromDate);
  if (filters.toDate) q = q.lte('schedule_date', filters.toDate);
  if (filters.isModified) q = q.eq('is_modified', true);
  if (filters.isReplaced) q = q.eq('is_replaced', true);
  if (filters.isTimeChanged) q = q.eq('is_time_changed', true);
  if (filters.isRoomChanged) q = q.eq('is_room_changed', true);

  q = q.order('schedule_date', { ascending: false });

  const { data, error } = await q;
  if (error) throw error;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rows = (data ?? []) as any[];

  if (filters.facultyId) {
    rows = rows.filter(
      (r) => r.actual_faculty?.id === filters.facultyId || r.daily_schedule?.assigned_faculty?.id === filters.facultyId
    );
  }

  if (filters.faculty_status) {
    rows = rows.filter((r) => {
      if (filters.faculty_status === 'not_engaged') {
        if (r.faculty_status === 'not_engaged') return true;
        if (r.is_replaced) {
          if (filters.facultyId) {
            return r.daily_schedule?.assigned_faculty?.id === filters.facultyId;
          }
          return true;
        }
        return false;
      }
      return r.faculty_status === filters.faculty_status;
    });
  }

  if (filters.courseId) rows = rows.filter((r) => r.daily_schedule?.course?.id === filters.courseId);
  if (filters.subjectId) rows = rows.filter((r) => r.daily_schedule?.subject?.id === filters.subjectId);
  if (filters.roomId) rows = rows.filter((r) => r.daily_schedule?.room?.id === filters.roomId);

  return rows;
}

export async function getFacultyLeaveSummary(facultyId: string | null = null, fromDate: string | null = null, toDate: string | null = null) {
  const supabase = createClient();
  let q = supabase
    .from('faculty_leaves')
    .select(
      `id, leave_date, leave_type, reason, status,
       faculty:faculty!faculty_id (id, full_name, employee_code),
       entered_by_admin:admin_users!entered_by (full_name)`
    )
    .order('leave_date', { ascending: false });

  if (facultyId) q = q.eq('faculty_id', facultyId);
  if (fromDate) q = q.gte('leave_date', fromDate);
  if (toDate) q = q.lte('leave_date', toDate);

  const { data, error } = await q;
  if (error) throw error;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const summaryMap: Record<string, any> = {};
  for (const r of rows) {
    const fid = r.faculty?.id;
    if (!fid) continue;
    if (!summaryMap[fid]) summaryMap[fid] = { faculty: r.faculty, counts: {}, total: 0 };
    summaryMap[fid].counts[r.leave_type] = (summaryMap[fid].counts[r.leave_type] ?? 0) + 1;
    summaryMap[fid].total++;
  }

  return { rows, summary: Object.values(summaryMap) };
}

export async function getDailyStats(date: string) {
  const supabase = createClient();
  const [execRes, schedRes] = await Promise.all([
    supabase.from('lecture_execution').select('faculty_status, is_modified, is_replaced, is_time_changed, is_room_changed').eq('schedule_date', date),
    supabase.from('daily_schedule').select('id, is_cancelled, time_slot:time_slots!time_slot_id(slot_type)').eq('schedule_date', date),
  ]);
  if (execRes.error) throw execRes.error;

  const exec = execRes.data ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sched = (schedRes.data ?? []) as any[];
  const lectureSched = sched.filter((r) => r.time_slot?.slot_type === 'lecture');

  return {
    total: lectureSched.length,
    cancelled: lectureSched.filter((r) => r.is_cancelled).length,
    marked: exec.length,
    on_time: exec.filter((r) => r.faculty_status === 'on_time').length,
    late: exec.filter((r) => r.faculty_status === 'late').length,
    not_engaged: exec.filter((r) => r.faculty_status === 'not_engaged').length,
    not_marked: exec.filter((r) => r.faculty_status === 'not_marked').length,
    modified: exec.filter((r) => r.is_modified).length,
    replaced: exec.filter((r) => r.is_replaced).length,
    time_changed: exec.filter((r) => r.is_time_changed).length,
    room_changed: exec.filter((r) => r.is_room_changed).length,
  };
}

export async function getRescheduledSlots(fromDate: string | null, toDate: string | null) {
  const supabase = createClient();
  let q = supabase
    .from('daily_schedule')
    .select(
      `id, schedule_date, is_rescheduled, cancel_reason,
       course:courses!course_id (year, program, division),
       subject:subjects!subject_id (subject_name),
       room:rooms!room_id (room_code),
       time_slot:time_slots!time_slot_id (start_time, end_time),
       assigned_faculty:faculty!assigned_faculty_id (full_name)`
    )
    .eq('is_rescheduled', true)
    .order('schedule_date', { ascending: false });

  if (fromDate) q = q.gte('schedule_date', fromDate);
  if (toDate) q = q.lte('schedule_date', toDate);

  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

/** Full picture of a single day's lecture slots, whether marked or not — for r1 and rc1. */
export async function getDailyFullTable(date: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('daily_schedule')
    .select(
      `id, is_cancelled, is_rescheduled,
       time_slot:time_slots!time_slot_id (start_time, end_time, slot_type, sort_order),
       room:rooms!room_id (room_code),
       course:courses!course_id (year, program, division),
       subject:subjects!subject_id (subject_name),
       assigned_faculty:faculty!assigned_faculty_id (full_name),
       execution:lecture_execution!daily_schedule_id (
         faculty_status, is_modified, is_replaced, is_time_changed, is_room_changed, remarks
       )`
    )
    .eq('schedule_date', date)
    .order('time_slot_id');

  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[])
    .filter((r) => r.time_slot?.slot_type === 'lecture')
    .sort((a, b) => (a.time_slot?.sort_order ?? 0) - (b.time_slot?.sort_order ?? 0));
}

export function courseLbl(c: { year: string; program: string; division: string | null } | null | undefined) {
  if (!c) return '—';
  return c.division ? `${c.year} ${c.program} ${c.division}` : `${c.year} ${c.program}`;
}
export function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
export function fmtTime(t: string | null | undefined) {
  return t ? t.slice(0, 5) : '—';
}

export const STATUS_LABELS: Record<string, string> = { on_time: 'On Time', late: 'Late', not_engaged: 'Not Engaged', not_marked: 'Not Marked' };
export const LEAVE_TYPE_LABELS: Record<string, string> = {
  casual: 'Casual', medical: 'Medical', earned: 'Earned', duty: 'Duty',
  half_day_morning: 'Half Day (AM)', half_day_afternoon: 'Half Day (PM)',
  compensatory: 'Compensatory', other: 'Other',
};
