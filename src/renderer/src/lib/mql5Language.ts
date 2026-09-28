import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import type { Monaco } from '@monaco-editor/react'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'
import { MQL5_LIFECYCLE_FUNCTIONS } from './extractCodeBlocks'

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
// custom Monarch languages (mql5, pinescript), so the generic editor worker is the only
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

const LIFECYCLE_FUNCTIONS: string[] = [...MQL5_LIFECYCLE_FUNCTIONS]

let registered = false

export function registerMql5Language(monacoInstance: Monaco): void {
  if (!registered) {
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
          [/'([^'\\]|\\.)*'/, 'string'],
          [/#\w+/, 'keyword'],
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

  const darkTheme = {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6d7682', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'e0a63e' },
      { token: 'keyword.control', foreground: '4cc98a', fontStyle: 'bold' },
      { token: 'type', foreground: '8eb4d4' },
      { token: 'string', foreground: 'c9b48a' },
      { token: 'number', foreground: 'd4a574' },
      { token: 'number.float', foreground: 'd4a574' },
      { token: 'identifier', foreground: 'eef1f4' }
    ],
    colors: {
      'editor.background': '#101317',
      'editor.foreground': '#eef1f4',
      'editorLineNumber.foreground': '#4e565f',
      'editorLineNumber.activeForeground': '#e0a63e',
      'editorCursor.foreground': '#e0a63e',
      'editor.selectionBackground': '#e0a63e33',
      'editor.inactiveSelectionBackground': '#e0a63e1a',
      'editor.lineHighlightBackground': '#1b212866',
      'editor.lineHighlightBorder': '#00000000',
      'editorGutter.background': '#101317',
      'editorIndentGuide.background1': '#262d35',
      'editorIndentGuide.activeBackground1': '#e0a63e55',
      'editorWidget.background': '#14181d',
      'editorWidget.border': '#262d35',
      'editorSuggestWidget.background': '#14181d',
      'editorSuggestWidget.border': '#262d35',
      'editorSuggestWidget.selectedBackground': '#1b2128',
      'editorBracketHighlight.foreground1': '#e0a63e',
      'editorBracketHighlight.foreground2': '#8eb4d4',
      'editorBracketHighlight.foreground3': '#4cc98a',
      'scrollbarSlider.background': '#262d3588',
      'scrollbarSlider.hoverBackground': '#e0a63e44',
      'scrollbarSlider.activeBackground': '#e0a63e66',
      'editorOverviewRuler.border': '#00000000'
    }
  }
  monacoInstance.editor.defineTheme('kairos-dark', darkTheme as Parameters<typeof monacoInstance.editor.defineTheme>[1])
  monacoInstance.editor.defineTheme('quantify-dark', darkTheme as Parameters<typeof monacoInstance.editor.defineTheme>[1])

  const lightTheme = {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '7a828c', fontStyle: 'italic' },
      { token: 'keyword', foreground: '8a5f1a' },
      { token: 'keyword.control', foreground: '1f7a4d', fontStyle: 'bold' },
      { token: 'type', foreground: '2f6bd1' },
      { token: 'string', foreground: '6f4c15' },
      { token: 'number', foreground: '8a5f1a' },
      { token: 'number.float', foreground: '8a5f1a' },
      { token: 'identifier', foreground: '14181d' }
    ],
    colors: {
      'editor.background': '#f4f5f7',
      'editor.foreground': '#14181d',
      'editorLineNumber.foreground': '#9aa1aa',
      'editorLineNumber.activeForeground': '#8a5f1a',
      'editorCursor.foreground': '#8a5f1a',
      'editor.selectionBackground': '#8a5f1a24',
      'editor.inactiveSelectionBackground': '#8a5f1a14',
      'editor.lineHighlightBackground': '#eceef166',
      'editor.lineHighlightBorder': '#00000000',
      'editorGutter.background': '#f4f5f7',
      'editorIndentGuide.background1': '#d8dbe0',
      'editorIndentGuide.activeBackground1': '#8a5f1a55',
      'editorWidget.background': '#ffffff',
      'editorWidget.border': '#d8dbe0',
      'editorSuggestWidget.background': '#ffffff',
      'editorSuggestWidget.border': '#d8dbe0',
      'editorSuggestWidget.selectedBackground': '#eceef1',
      'editorBracketHighlight.foreground1': '#8a5f1a',
      'editorBracketHighlight.foreground2': '#2f6bd1',
      'editorBracketHighlight.foreground3': '#1f7a4d',
      'scrollbarSlider.background': '#d8dbe088',
      'scrollbarSlider.hoverBackground': '#8a5f1a33',
      'scrollbarSlider.activeBackground': '#8a5f1a55',
      'editorOverviewRuler.border': '#00000000'
    }
  }
  monacoInstance.editor.defineTheme('kairos-light', lightTheme as Parameters<typeof monacoInstance.editor.defineTheme>[1])
  monacoInstance.editor.defineTheme('quantify-light', lightTheme as Parameters<typeof monacoInstance.editor.defineTheme>[1])
}

let pineRegistered = false

function registerPineScriptLanguage(monacoInstance: Monaco): void {
  if (pineRegistered) return
  pineRegistered = true
  monacoInstance.languages.register({ id: 'pinescript' })
  monacoInstance.languages.setMonarchTokensProvider('pinescript', {
    keywords: [
      'if',
      'else',
      'for',
      'to',
      'by',
      'while',
      'switch',
      'break',
      'continue',
      'true',
      'false',
      'na',
      'and',
      'or',
      'not',
      'var',
      'varip',
      'import',
      'export',
      'method',
      'type',
      'enum',
      'in'
    ],
    builtins: [
      'indicator',
      'strategy',
      'library',
      'plot',
      'plotshape',
      'plotchar',
      'plotcandle',
      'plotbar',
      'fill',
      'hline',
      'bgcolor',
      'barcolor',
      'alert',
      'alertcondition',
      'input'
    ],
    tokenizer: {
      root: [
        [/\/\/@@version=[\w.]+/, 'keyword.control'],
        [/\/\/.*$/, 'comment'],
        [/"([^"\\]|\\.)*"/, 'string'],
        [/'([^'\\]|\\.)*'/, 'string'],
        [/\b\d+\.\d+\b/, 'number.float'],
        [/\b\d+\b/, 'number'],
        [
          /[a-zA-Z_]\w*/,
          {
            cases: {
              '@keywords': 'keyword',
              '@builtins': 'keyword.control',
              '@default': 'identifier'
            }
          }
        ]
      ]
    }
  })
}

export function registerLabLanguages(monacoInstance: Monaco): void {
  registerMql5Language(monacoInstance)
  registerPineScriptLanguage(monacoInstance)
}
