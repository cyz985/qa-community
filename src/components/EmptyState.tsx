/** 空状态占位 */
export default function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 py-12 text-center text-gray-400">
      {text}
    </div>
  );
}

/** 加载占位 */
export function Loading() {
  return <div className="py-12 text-center text-gray-400">加载中…</div>;
}
