import { EA_LOCAL_EXAMPLE, eaChatInstructions } from './eaLanguage'

export const SCRIPT_KINDS = ['ea', 'indicator'] as const
export type ScriptKind = (typeof SCRIPT_KINDS)[number]

export const SCRIPT_LANGUAGES = ['mql5', 'pinescript'] as const
export type ScriptLanguage = (typeof SCRIPT_LANGUAGES)[number]

export function isScriptKind(value: unknown): value is ScriptKind {
  return value === 'ea' || value === 'indicator'
}

export function isScriptLanguage(value: unknown): value is ScriptLanguage {
  return value === 'mql5' || value === 'pinescript'
}

export function scriptLanguage(kind: ScriptKind, value: unknown): ScriptLanguage {
  if (kind === 'ea') return 'mql5'
  return isScriptLanguage(value) ? value : 'mql5'
}

export function defaultScriptName(kind: ScriptKind): string {
  return kind === 'indicator' ? 'Untitled Indicator' : 'Untitled Bot'
}

export function fileExtension(language: ScriptLanguage, kind?: ScriptKind): string {
  if (kind === 'ea') return '.kairos'
  return language === 'pinescript' ? '.pine' : '.mq5'
}

export function monacoLanguage(language: ScriptLanguage): string {
  return language === 'pinescript' ? 'pinescript' : 'mql5'
}

export function languageLabel(language: ScriptLanguage, kind?: ScriptKind): string {
  if (kind === 'ea') return 'Kairos Bot Rules'
  return language === 'pinescript' ? 'Pine Script' : 'MQL5'
}

export function fenceLanguage(language: ScriptLanguage, kind?: ScriptKind): string {
  if (kind === 'ea') return 'kairos'
  return language === 'pinescript' ? 'pine' : 'mql5'
}

export function labCopy(kind: ScriptKind): {
  brandSubtitle: string
  untitled: string
  emptyExplorer: string
  emptyEditor: string
  newFile: string
  newFileTitle: string
  deleteTitle: string
  removed: string
  settingsBack: string
  welcomeTitle: string
  welcomeBody: string
} {
  if (kind === 'indicator') {
    return {
      brandSubtitle: 'Indicator development',
      untitled: 'Untitled Indicator',
      emptyExplorer: 'No indicators yet. Create an MQL5 or Pine Script file to open the editor.',
      emptyEditor: 'Create an MQL5 or Pine Script indicator to start editing.',
      newFile: 'New indicator',
      newFileTitle: 'New indicator',
      deleteTitle: 'Delete indicator',
      removed: 'Indicator removed',
      settingsBack: 'Back to Indicator Lab',
      welcomeTitle: 'Indicator Development Lab',
      welcomeBody: 'Build MQL5 and Pine Script indicators'
    }
  }
  return {
    brandSubtitle: 'Bot Lab',
    untitled: 'Untitled Bot',
    emptyExplorer: 'No bots yet. Create one, or ask AI to write the rules.',
    emptyEditor: 'Create a bot, then ask AI to write entry rules and run a backtest.',
    newFile: 'New bot',
    newFileTitle: 'New bot',
    deleteTitle: 'Delete bot',
    removed: 'Bot removed',
    settingsBack: 'Back to Bot Lab',
    welcomeTitle: 'Bot Lab',
    welcomeBody: 'Build trading bots with AI and backtest them here'
  }
}

export function chatSystemRole(kind: ScriptKind, language: ScriptLanguage): string {
  if (kind === 'indicator' && language === 'pinescript') {
    return [
      'You are helping the user write a TradingView Pine Script v5 custom indicator.',
      'Use //@version=5, indicator(), and plot/fill/hline. Prefer overlay or pane indicators.',
      'Do not write strategy() order logic or MQL5 unless the user explicitly asks.'
    ].join('\n')
  }
  if (kind === 'indicator') {
    return [
      'You are helping the user write an MQL5 Custom Indicator for MetaTrader.',
      'Use OnCalculate, indicator buffers, plots, and #property indicator_* directives.',
      'Do not write Expert Advisor trading logic (OnTick order placement) or Pine Script unless the user explicitly asks.'
    ].join('\n')
  }
  return eaChatInstructions()
}

export const EA_STARTER_TEMPLATE = `// Kairos Bot Rules — build here, backtest in Kairos.
// Ask AI to describe entries; use Check then Run backtest.
// MetaTrader MQL5 export comes later — do not paste full MQL5 here.

${EA_LOCAL_EXAMPLE}
`

export const INDICATOR_STARTER_TEMPLATE = `#property indicator_chart_window
#property indicator_buffers 1
#property indicator_plots   1
#property indicator_type1   DRAW_LINE
#property indicator_color1  clrDodgerBlue

double Buffer[];

int OnInit()
{
   SetIndexBuffer(0, Buffer, INDICATOR_DATA);
   return INIT_SUCCEEDED;
}

int OnCalculate(const int rates_total,
                const int prev_calculated,
                const datetime &time[],
                const double &open[],
                const double &high[],
                const double &low[],
                const double &close[],
                const long &tick_volume[],
                const long &volume[],
                const int &spread[])
{
   return rates_total;
}
`

export const PINE_STARTER_TEMPLATE = `//@version=5
indicator("Untitled Indicator", overlay=true)

plot(ta.sma(close, 14), "SMA 14")
`

export function starterTemplate(kind: ScriptKind, language: ScriptLanguage = 'mql5'): string {
  if (kind === 'indicator' && language === 'pinescript') return PINE_STARTER_TEMPLATE
  if (kind === 'indicator') return INDICATOR_STARTER_TEMPLATE
  return EA_STARTER_TEMPLATE
}
