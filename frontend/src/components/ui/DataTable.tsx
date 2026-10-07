import { type ReactNode } from "react";

export interface Column<T> {
  key: string;
  header: string;
  render: (item: T) => ReactNode;
  className?: string;
  headerClassName?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string | number;
  emptyMessage?: string;
  onRowClick?: (item: T) => void;
  className?: string;
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  emptyMessage = "No entries found.",
  onRowClick,
  className = "",
}: DataTableProps<T>) {
  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-surface p-8 text-center text-xs text-muted">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={`overflow-x-auto rounded-xl border border-line bg-surface shadow-xs ${className}`}>
      {/* Desktop & Tablet Table */}
      <table className="w-full text-left text-sm hidden md:table">
        <thead className="border-b border-line bg-surface-subtle/80 text-xs text-muted font-mono uppercase tracking-wider">
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={`px-4 py-3 font-medium ${col.headerClassName || ""}`}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {data.map((item) => {
            const isClickable = Boolean(onRowClick);
            return (
              <tr
                key={keyExtractor(item)}
                onClick={() => onRowClick?.(item)}
                className={`transition-colors ${
                  isClickable ? "cursor-pointer hover:bg-surface-hover/70" : "hover:bg-surface-subtle/40"
                }`}
              >
                {columns.map((col) => (
                  <td key={col.key} className={`px-4 py-3.5 ${col.className || ""}`}>
                    {col.render(item)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Mobile Stacked Card List (<768px) */}
      <div className="divide-y divide-line md:hidden">
        {data.map((item) => {
          const isClickable = Boolean(onRowClick);
          return (
            <div
              key={keyExtractor(item)}
              onClick={() => onRowClick?.(item)}
              className={`p-4 space-y-2.5 ${
                isClickable ? "cursor-pointer active:bg-surface-subtle" : ""
              }`}
            >
              {columns.map((col) => (
                <div key={col.key} className="flex items-start justify-between gap-3 text-xs">
                  <span className="font-medium text-muted font-mono uppercase text-[0.7rem] shrink-0 pt-0.5">
                    {col.header}
                  </span>
                  <div className="text-right text-ink min-w-0 flex-1">{col.render(item)}</div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
