import type { ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type DataTableColumn<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  /** Hide on small screens (the table still scrolls horizontally). */
  hideOnMobile?: boolean;
};

/**
 * Server-compatible table. Pass `empty` (usually an <EmptyState/>) for the
 * zero-row case. Client-side sorting/filtering/pagination will be layered on
 * top in later phases via TanStack Table where needed.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty,
  caption,
  className,
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty: ReactNode;
  caption?: string;
  className?: string;
}) {
  if (rows.length === 0) return <>{empty}</>;

  return (
    <div className={cn("bg-card min-w-0 rounded-lg border", className)}>
      <Table>
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((col) => (
              <TableHead key={col.key} className={cn(col.hideOnMobile && "hidden md:table-cell", col.className)}>
                {col.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={rowKey(row)}>
              {columns.map((col) => (
                <TableCell key={col.key} className={cn(col.hideOnMobile && "hidden md:table-cell", col.className)}>
                  {col.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
