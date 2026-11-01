import { Fragment, type ReactNode } from 'react'

/** **bold** spans inside a line of plain text. */
function inline(s: string): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>)
}

/** Lesson text: blank-line paragraphs, "- " bullet lists and **bold**. Everything is rendered as text, never HTML. */
export default function RichText({ text }: { text: string }) {
  const blocks = text.trim().split(/\n\s*\n/)
  return (
    <div className="rich">
      {blocks.map((b, i) => {
        const lines = b.split('\n').filter(l => l.trim())
        if (lines.every(l => /^\s*[-•]\s/.test(l))) {
          return <ul key={i}>{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*[-•]\s/, ''))}</li>)}</ul>
        }
        return <p key={i}>{lines.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l)}</Fragment>)}</p>
      })}
    </div>
  )
}
