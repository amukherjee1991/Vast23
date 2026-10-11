import { Fragment, type ReactNode } from 'react'

/** Negative ids (−811, −206) set in a serif lose their sign: Bodoni Moda's
    hyphen and minus are hairlines. Set the sign in Archivo so it reads. Only a
    sign that opens a number (after a space, a bracket or the start) is
    touched, so ranges like 2028-2034 stay as they are. */
export function withMinus(text: string): ReactNode {
  const parts = text.split(/(^|[\s(])[−-](?=\d)/)
  if (parts.length === 1) return text
  // split keeps the captured lead-in: [text, lead, text, lead, text, …]
  return parts.map((t, i) =>
    i % 2 === 1 ? (
      <Fragment key={i}>
        {t}
        <span className="minus">−</span>
      </Fragment>
    ) : (
      t
    ),
  )
}
