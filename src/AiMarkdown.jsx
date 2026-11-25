import { inlineMarkdown, parseAiMarkdown } from './aiMarkdown.js';

function Rich({ text }) {
  return inlineMarkdown(text).map((part, index) => (
    part.bold
      ? <strong key={index} className="font-bold text-gray-900">{part.text}</strong>
      : <span key={index}>{part.text}</span>
  ));
}

export default function AiMarkdown({ text }) {
  const blocks = parseAiMarkdown(text);
  if (!blocks.length) return null;
  return (
    <div className="space-y-3 text-sm leading-relaxed text-gray-700">
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          return <h4 key={index} className="pt-1 text-base font-bold text-gray-900"><Rich text={block.text} /></h4>;
        }
        if (block.type === 'note') {
          return <p key={index} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900"><Rich text={block.text} /></p>;
        }
        if (block.type === 'list') {
          return (
            <ul key={index} className="list-disc space-y-1 pl-5">
              {block.items.map((item, itemIndex) => <li key={itemIndex}><Rich text={item} /></li>)}
            </ul>
          );
        }
        if (block.type === 'table') {
          const [head, ...body] = block.rows;
          return (
            <div key={index} className="overflow-x-auto rounded-lg border border-emerald-100">
              <table className="min-w-full border-collapse text-left text-xs">
                {head && (
                  <thead className="bg-emerald-50 text-emerald-900">
                    <tr>
                      {head.map((cell, cellIndex) => <th key={cellIndex} className="px-2.5 py-2 font-bold"><Rich text={cell} /></th>)}
                    </tr>
                  </thead>
                )}
                <tbody>
                  {body.map((row, rowIndex) => (
                    <tr key={rowIndex} className={rowIndex % 2 ? 'bg-gray-50' : 'bg-white'}>
                      {row.map((cell, cellIndex) => <td key={cellIndex} className="border-t border-emerald-50 px-2.5 py-2 align-top"><Rich text={cell} /></td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return <p key={index} className="whitespace-pre-wrap"><Rich text={block.text} /></p>;
      })}
    </div>
  );
}
