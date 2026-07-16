import React, { useState, useMemo } from 'react';

export default function DataTable({ columns, data, onRowClick, onRowContextMenu = null, searchable = true, pageSize = 10, selectable = false, onBulkAction = null, bulkActionLabel = 'Delete Selected', rowId = null }) {
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState(new Set());

  const filtered = useMemo(() => {
    if (!search) return data;
    const q = search.toLowerCase();
    return data.filter((row) =>
      columns.some((col) => {
        const val = col.accessor ? (typeof col.accessor === 'function' ? col.accessor(row) : row[col.accessor]) : '';
        return String(val).toLowerCase().includes(q);
      })
    );
  }, [data, search, columns]);

  const sorted = useMemo(() => {
    if (!sortCol) return filtered;
    const col = columns.find((c) => c.key === sortCol);
    if (!col) return filtered;
    return [...filtered].sort((a, b) => {
      const aVal = typeof col.accessor === 'function' ? col.accessor(a) : a[col.accessor];
      const bVal = typeof col.accessor === 'function' ? col.accessor(b) : b[col.accessor];
      const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortCol, sortDir, columns]);

  const totalPages = Math.ceil(sorted.length / pageSize);
  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize);

  const handleSort = (key) => {
    if (sortCol === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(key);
      setSortDir('asc');
    }
  };

  // record_id comes first: recording rows have no id/enrollment_id, and several
  // recordings can share one session_id — keying on session_id would collide
  // and React would render only one of them.
  const getRowId = (row) => (rowId ? rowId(row) : (row.record_id || row.id || row.enrollment_id || row.session_id));

  const toggleSelect = (row) => {
    const id = getRowId(row);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const pageIds = paged.map(getRowId);
    const allSelected = pageIds.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        pageIds.forEach((id) => next.delete(id));
      } else {
        pageIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const handleBulkAction = () => {
    if (onBulkAction && selectedIds.size > 0) {
      onBulkAction([...selectedIds]);
      setSelectedIds(new Set());
    }
  };

  const allPageSelected = paged.length > 0 && paged.every((r) => selectedIds.has(getRowId(r)));

  return (
    <div className="data-table-container">
      <div className="data-table-toolbar">
        {searchable && (
          <>
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              className="data-table-search"
            />
            <span className="data-table-count">{filtered.length} records</span>
          </>
        )}
        {selectable && selectedIds.size > 0 && (
          <button className="btn btn-sm btn-danger" onClick={handleBulkAction} style={{ marginLeft: 'auto' }}>
            {bulkActionLabel} ({selectedIds.size})
          </button>
        )}
      </div>

      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              {selectable && (
                <th style={{ width: 40 }}>
                  <input type="checkbox" checked={allPageSelected} onChange={toggleSelectAll} />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => col.sortable !== false && handleSort(col.key)}
                  className={col.sortable !== false ? 'sortable' : ''}
                >
                  {col.label}
                  {sortCol === col.key && (
                    <span className="sort-indicator">{sortDir === 'asc' ? ' ▲' : ' ▼'}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr><td colSpan={columns.length + (selectable ? 1 : 0)} className="no-data">No data found</td></tr>
            ) : (
              paged.map((row, i) => (
                <tr
                  key={getRowId(row) || i}
                  onClick={() => onRowClick?.(row)}
                  onContextMenu={onRowContextMenu ? (e) => onRowContextMenu(row, e) : undefined}
                  className={`${onRowClick ? 'clickable' : ''} ${selectedIds.has(getRowId(row)) ? 'row-selected' : ''}`}
                >
                  {selectable && (
                    <td onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedIds.has(getRowId(row))} onChange={() => toggleSelect(row)} />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td key={col.key}>
                      {col.render
                        ? col.render(row)
                        : typeof col.accessor === 'function'
                        ? col.accessor(row)
                        : row[col.accessor]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="data-table-pagination">
          <button onClick={() => setPage(0)} disabled={page === 0}>First</button>
          <button onClick={() => setPage((p) => p - 1)} disabled={page === 0}>Prev</button>
          <span>Page {page + 1} of {totalPages}</span>
          <button onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages - 1}>Next</button>
          <button onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1}>Last</button>
        </div>
      )}
    </div>
  );
}
