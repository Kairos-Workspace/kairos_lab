import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import type { Monaco } from '@monaco-editor/react'

// @monaco-editor/react defaults to fetching Monaco from a CDN at runtime,
// which this app's CSP blocks outright. Pointing it at the locally
// installed package is required for the editor to load at all.
loader.config({ monaco })

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
