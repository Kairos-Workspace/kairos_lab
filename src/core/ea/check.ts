import type { Expr, FunctionDecl, Program, Span, Stmt } from './ast'
import type { Diagnostic } from './types'
import { EA_BUILTINS } from '@shared/eaLanguage'

const SERIES = new Set(['open', 'high', 'low', 'close', 'time'])

function diagnostic(message: string, span: Span): Diagnostic {
  return {
    severity: 'error',
    message,
    line: span.line,
    column: span.column,
    length: span.length || 1
  }
}

export function checkProgram(program: Program): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const globals = new Set([
    ...program.inputs.map((input) => input.name),
    ...program.globals.map((variable) => variable.name)
  ])

  if (!program.onTick) {
    diagnostics.push({
      severity: 'error',
      message: 'Program must declare OnTick',
      line: 1,
      column: 1,
      length: 1
    })
  }

  const checkExpr = (expr: Expr, scope: Set<string>, functionName: FunctionDecl['name']): void => {
    switch (expr.kind) {
      case 'number':
      case 'bool':
      case 'string':
        return
      case 'ident':
        if (!scope.has(expr.name)) {
          diagnostics.push(diagnostic(`Unknown identifier '${expr.name}'`, expr.span))
        }
        return
      case 'series':
        if (!SERIES.has(expr.series)) {
          diagnostics.push(diagnostic(`Unknown series '${expr.series}'`, expr.span))
        }
        checkExpr(expr.index, scope, functionName)
        return
      case 'call': {
        const builtin = EA_BUILTINS[expr.callee]
        if (!builtin) {
          diagnostics.push(diagnostic(`Unknown function '${expr.callee}'`, expr.span))
        } else {
          if (expr.args.length < builtin.minArgs || expr.args.length > builtin.maxArgs) {
            const expected =
              builtin.minArgs === builtin.maxArgs
                ? `${builtin.minArgs}`
                : `${builtin.minArgs}-${builtin.maxArgs}`
            diagnostics.push(
              diagnostic(
                `${expr.callee} expects ${expected} argument(s), got ${expr.args.length}`,
                expr.span
              )
            )
          }
          if (builtin.inTickOnly && functionName !== 'OnTick') {
            diagnostics.push(diagnostic(`${expr.callee} may only be called in OnTick`, expr.span))
          }
        }
        for (const argument of expr.args) checkExpr(argument, scope, functionName)
        return
      }
      case 'unary':
        checkExpr(expr.arg, scope, functionName)
        return
      case 'binary':
        checkExpr(expr.left, scope, functionName)
        checkExpr(expr.right, scope, functionName)
    }
  }

  const checkStatements = (
    statements: Stmt[],
    scope: Set<string>,
    functionName: FunctionDecl['name']
  ): void => {
    for (const statement of statements) {
      switch (statement.kind) {
        case 'var':
          if (statement.init) checkExpr(statement.init, scope, functionName)
          scope.add(statement.name)
          break
        case 'assign':
          if (!scope.has(statement.name)) {
            diagnostics.push(
              diagnostic(`Cannot assign to unknown variable '${statement.name}'`, statement.span)
            )
          }
          checkExpr(statement.value, scope, functionName)
          break
        case 'if':
          checkExpr(statement.test, scope, functionName)
          checkStatements(statement.consequent, new Set(scope), functionName)
          if (statement.alternate) {
            checkStatements(statement.alternate, new Set(scope), functionName)
          }
          break
        case 'expr':
          checkExpr(statement.expr, scope, functionName)
          break
        case 'return':
          break
      }
    }
  }

  for (const variable of program.globals) {
    if (variable.init) checkExpr(variable.init, globals, 'OnInit')
  }

  const checkFunction = (fn: FunctionDecl | null): void => {
    if (!fn) return
    checkStatements(fn.body, new Set(globals), fn.name)
  }

  checkFunction(program.onInit)
  checkFunction(program.onTick)

  return diagnostics
}
