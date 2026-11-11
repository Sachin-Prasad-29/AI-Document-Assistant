import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'

const components: Components = {
    p: ({ children }) => (
        <p className="font-body-md text-body-md text-on-surface leading-relaxed my-1.5 first:mt-0 last:mb-0">
            {children}
        </p>
    ),
    strong: ({ children }) => <strong className="font-bold text-on-surface">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
    del: ({ children }) => <del className="line-through opacity-70">{children}</del>,
    ul: ({ children }) => (
        <ul className="list-disc pl-5 my-1.5 font-body-md text-body-md text-on-surface leading-relaxed">
            {children}
        </ul>
    ),
    ol: ({ children }) => (
        <ol className="list-decimal pl-5 my-1.5 font-body-md text-body-md text-on-surface leading-relaxed">
            {children}
        </ol>
    ),
    li: ({ children }) => <li className="my-0.5">{children}</li>,
    h1: ({ children }) => <h1 className="font-headline-sm text-headline-sm font-semibold text-on-surface mt-2 mb-1">{children}</h1>,
    h2: ({ children }) => <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface mt-2 mb-1">{children}</h2>,
    h3: ({ children }) => <h3 className="font-body-md text-body-md font-bold text-on-surface mt-2 mb-1">{children}</h3>,
    h4: ({ children }) => <h4 className="font-body-sm text-body-sm font-bold text-on-surface mt-2 mb-1">{children}</h4>,
    code: ({ children }) => (
        <code className="font-code-inline text-code-inline bg-surface-container-lowest text-primary rounded px-1.5 py-0.5">
            {children}
        </code>
    ),
    pre: ({ children }) => (
        <pre className="my-2 p-3 rounded-lg bg-surface-container-lowest overflow-x-auto font-code-inline text-code-inline leading-relaxed [&>code]:bg-transparent [&>code]:p-0 [&>code]:text-on-surface">
            {children}
        </pre>
    ),
    a: ({ children, href }) => (
        <a href={href} target="_blank" rel="noreferrer noopener" className="text-primary underline underline-offset-2 hover:text-inverse-primary">
            {children}
        </a>
    ),
    blockquote: ({ children }) => (
        <blockquote className="border-l-2 border-outline-variant/50 pl-3 my-1.5 text-on-surface-variant italic">
            {children}
        </blockquote>
    ),
    hr: () => <hr className="my-3 border-outline-variant/30" />,
    table: ({ children }) => (
        <div className="my-2 overflow-x-auto">
            <table className="text-body-sm text-on-surface border-collapse">{children}</table>
        </div>
    ),
    th: ({ children }) => (
        <th className="border border-outline-variant/40 px-2 py-1 bg-surface-container-lowest font-semibold text-left">{children}</th>
    ),
    td: ({ children }) => <td className="border border-outline-variant/40 px-2 py-1 align-top">{children}</td>,
}

function MarkdownMessage({ text }: { text: string }) {
    return <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{text}</ReactMarkdown>
}

export default MarkdownMessage
