'use client';

import { useMemo, useState, type ReactNode } from 'react';

export interface ReportColumn<T> {
  header: string;
  render: (row: T) => ReactNode;
  /** Plain text used for search-matching and sort comparison. */
  textVal: (row: T) => string;
}

interface Props<T> {
  columns: ReportColumn<T>[];
  rows: T[];
  search: string;
  emptyMessage: string;
  loading?: boolean;
  rowKey: (row: T, index: number) => string;
}

export default function ReportTable<T>({ columns, rows, search, emptyMessage, loading, rowKey }: Props<T>) {
  const [sort, setSort] = useState<{ col: number; dir: 'asc' | 'desc' } | null>(null);

  const displayRows = useMemo(() => {
    let out = rows;
    if (search) {
      const q = search.toLowerCase();
      out = out.filter((r) => columns.some((c) => c.textVal(r).toLowerCase().includes(q)));
    }
    if (sort) {
      out = [...out].sort((a, b) => {
        const av = columns[sort.col].textVal(a);
        const bv = columns[sort.col].textVal(b);
        const cmp = av.localeCompare(bv, undefined, { numeric: true });
        return sort.dir === 'asc' ? cmp : -cmp;
      });
    }
    return out;
  }, [rows, search, sort, columns]);

  function toggleSort(i: number) {
    setSort((prev) => (prev?.col === i ? { col: i, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col: i, dir: 'asc' }));
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={c.header} className="sortable" onClick={() => toggleSort(i)} title="Click to sort column">
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr className="empty-row">
              <td colSpan={columns.length}>
                <span className="spin" /> Loading…
              </td>
            </tr>
          ) : displayRows.length === 0 ? (
            <tr className="empty-row">
              <td colSpan={columns.length}>{emptyMessage}</td>
            </tr>
          ) : (
            displayRows.map((row, i) => (
              <tr key={rowKey(row, i)}>
                {columns.map((c) => (
                  <td key={c.header}>{c.render(row)}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
