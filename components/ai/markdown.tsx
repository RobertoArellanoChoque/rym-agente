"use client"

// Vendorizado de 21st.dev #12398 "Markdown" (Agent Elements, serafimcloud),
// re-tokenizado al design system RyM (app/DESIGN.md) + remark-breaks para
// respetar saltos de línea simples del LLM (antes: whitespace-pre-wrap).

import { memo } from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import remarkBreaks from "remark-breaks"
import { cn } from "@/lib/utils"

function fixNumberedListBreaks(text: string): string {
  return text.replace(/^(\d+)\.\s*\n+\s*\n*/gm, "$1. ")
}

const CODE_FENCE_LANGS = new Set([
  "bash", "diff", "html", "js", "json", "jsx", "md", "markdown",
  "sh", "shell", "text", "ts", "tsx", "yml", "yaml",
])

function normalizeCodeFenceLanguages(text: string): string {
  return text.replace(/```([^\n]*)/g, (_match, langRaw) => {
    const lang = String(langRaw || "").trim().toLowerCase()
    if (!lang) return "```"
    const normalized = lang.split(/\s+/)[0]
    return CODE_FENCE_LANGS.has(normalized) ? `\`\`\`${normalized}` : "```text"
  })
}

const components: Components = {
  h1: ({ children, ...props }) => (
    <h1 className="text-base font-semibold mt-3 mb-1.5 text-foreground" {...props}>{children}</h1>
  ),
  h2: ({ children, ...props }) => (
    <h2 className="text-base font-semibold mt-3 mb-1.5 text-foreground" {...props}>{children}</h2>
  ),
  h3: ({ children, ...props }) => (
    <h3 className="text-sm font-semibold mt-2 mb-1 text-foreground" {...props}>{children}</h3>
  ),
  h4: ({ children, ...props }) => (
    <h4 className="text-sm font-medium mt-2 mb-1 text-foreground" {...props}>{children}</h4>
  ),
  p: ({ children, ...props }) => (
    <p className="text-sm leading-relaxed mb-2 text-foreground/90" {...props}>{children}</p>
  ),
  ul: ({ children, ...props }) => (
    <ul className="list-disc list-outside space-y-0.5 text-sm mb-2 pl-4 text-foreground/90" {...props}>{children}</ul>
  ),
  ol: ({ children, ...props }) => (
    <ol className="list-decimal list-outside space-y-0.5 text-sm mb-2 pl-5 text-foreground/90" {...props}>{children}</ol>
  ),
  li: ({ children, ...props }) => (
    <li className="text-sm pl-0.5 text-foreground/90" {...props}>{children}</li>
  ),
  strong: ({ children, ...props }) => (
    <strong className="font-medium text-foreground" {...props}>{children}</strong>
  ),
  em: ({ children, ...props }) => (
    <em className="italic" {...props}>{children}</em>
  ),
  a: ({ href, children, ...props }) => {
    if (!href) return <span>{children}</span>
    const isExternal = href.startsWith("http") || href.startsWith("mailto:")
    return (
      <a
        {...props}
        href={href}
        target={isExternal ? "_blank" : undefined}
        rel={isExternal ? "noopener noreferrer" : undefined}
        className="hover:underline underline-offset-2 text-primary"
      >
        {children}
      </a>
    )
  },
  blockquote: ({ children, ...props }) => (
    <blockquote className="pl-3 italic mb-2 text-sm border-l-2 border-border text-muted-foreground" {...props}>{children}</blockquote>
  ),
  hr: ({ ...props }) => <hr className="my-4 border-border" {...props} />,
  table: ({ children, ...props }) => (
    <div className="overflow-x-auto my-3 border border-border rounded-lg">
      <table className="w-full text-sm" {...props}>{children}</table>
    </div>
  ),
  thead: ({ children, ...props }) => (
    <thead className="bg-muted" {...props}>{children}</thead>
  ),
  th: ({ children, ...props }) => (
    <th className="text-left font-medium px-3 py-2 text-foreground" {...props}>{children}</th>
  ),
  td: ({ children, ...props }) => (
    <td className="px-3 py-2 border-t border-border font-mono tabular-nums text-foreground/90" {...props}>{children}</td>
  ),
  code: ({ children, className, ...props }) => {
    const isBlock = typeof className === "string" && className.startsWith("language-")
    if (isBlock) {
      return <code className={className} {...props}>{children}</code>
    }
    return (
      <code className="px-1 py-0.5 rounded bg-muted text-[0.875em] font-mono text-foreground" {...props}>{children}</code>
    )
  },
  pre: ({ children, ...props }) => (
    <pre className="my-3 p-3 rounded-lg border border-border bg-muted/50 overflow-x-auto text-xs font-mono text-foreground" {...props}>{children}</pre>
  ),
}

export type MarkdownProps = {
  content: string
  className?: string
}

export const Markdown = memo(function Markdown({ content, className }: MarkdownProps) {
  const safeContent = normalizeCodeFenceLanguages(fixNumberedListBreaks(content))
  return (
    <div className={cn("break-words", className)}>
      <ReactMarkdown components={components} remarkPlugins={[remarkGfm, remarkBreaks]}>
        {safeContent}
      </ReactMarkdown>
    </div>
  )
})
