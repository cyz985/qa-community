import ReactMarkdown from 'react-markdown';

/**
 * Markdown 渲染组件
 * 默认不渲染原始 HTML（react-markdown 默认安全行为），防止 XSS
 */
export default function Markdown({ content }: { content: string }) {
  return (
    <div className="markdown-body text-gray-800">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}
