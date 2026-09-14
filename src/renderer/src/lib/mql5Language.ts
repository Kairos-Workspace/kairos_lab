import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import type { Monaco } from '@monaco-editor/react'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'

// @monaco-editor/react defaults to fetching Monaco from a CDN at runtime,
// which this app's CSP blocks outright. Pointing it at the locally
// installed package is required for the editor to load at all.
loader.config({ monaco })

// Without this, Monaco falls back to its own built-in worker resolution
// (a relative `new URL(..., import.meta.url)` baked into its compiled
// output), which doesn't survive Vite's dev-server module transforms and
// fails with "Failed to fetch dynamically imported module". Vite's `?worker`
// suffix is a static import it can reliably bundle for both dev and build,
// sidestepping Monaco's own resolution entirely. This app only registers a
// custom Monarch language (mql5), so the generic editor worker is the only
// one ever requested — no per-language workers (json/ts/css/html) needed.
self.MonacoEnvironment = {
  getWorker() {
    return new EditorWorker()
  }
}

const KEYWORDS = [
  'if',
  'else',
  'for',
  'while',
  'do',
  'switch',
  'case',
  'default',
  'break',
  'continue',
  'return',
  'true',
  'false',
  'const',
  'static',
  'struct',
  'class',
  'enum',
  'input',
  'extern'
]

const TYPE_KEYWORDS = [
  'void',
  'int',
  'uint',
  'long',
  'ulong',
  'short',
  'ushort',
  'char',
  'uchar',
  'double',
  'float',
  'bool',
  'string',
  'datetime',
  'color'
]

const LIFECYCLE_FUNCTIONS = ['OnInit', 'OnTick', 'OnDeinit', 'OnTimer']

let registered = false

export function registerMql5Language(monacoInstance: Monaco): void {
  if (registered) return
  registered = true

  monacoInstance.languages.register({ id: 'mql5' })

  monacoInstance.languages.setMonarchTokensProvider('mql5', {
    keywords: KEYWORDS,
    typeKeywords: TYPE_KEYWORDS,
    lifecycle: LIFECYCLE_FUNCTIONS,
    tokenizer: {
      root: [
        [/\/\/.*$/, 'comment'],
        [/\/\*/, 'comment', '@comment'],
        [/"([^"\\]|\\.)*"/, 'string'],
        [/\b\d+\.\d+\b/, 'number.float'],
        [/\b\d+\b/, 'number'],
        [
          /[a-zA-Z_]\w*/,
          {
            cases: {
              '@keywords': 'keyword',
              '@typeKeywords': 'type',
              '@lifecycle': 'keyword.control',
              '@default': 'identifier'
            }
          }
        ]
      ],
      comment: [
        [/[^/*]+/, 'comment'],
        [/\*\//, 'comment', '@pop'],
        [/[/*]/, 'comment']
      ]
    }
  })
}
