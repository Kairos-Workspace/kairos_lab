// The chat system prompt asks the model to embed a rename hint inline in its
// own reply text (either as an <!--ql-file:...--> comment or a leading
// Rename:/File:/Script: line). Both the renderer (to keep it out of what's
// displayed) and the main process (to keep it out of what's persisted and
// resent as conversation history) need to strip it the same way.
export function stripScriptDirectives(content: string): string {
  return content
    .replace(/<!--ql-file:\s*[^>]+?-->\s*/gi, '')
    .replace(/^(?:Rename|File(?:name)?|Script):\s*.+\n?/gim, '')
}
