interface PaginationProps {
  page: number; // 当前页（从 1 开始）
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}

/** 通用分页组件 */
export default function Pagination({ page, pageSize, total, onChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-2 py-6">
      <button
        className="rounded border px-3 py-1 text-sm disabled:opacity-40"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        上一页
      </button>
      <span className="text-sm text-gray-600">
        第 {page} / {totalPages} 页
      </span>
      <button
        className="rounded border px-3 py-1 text-sm disabled:opacity-40"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        下一页
      </button>
    </div>
  );
}
