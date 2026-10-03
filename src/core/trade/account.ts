import { DEFAULT_BALANCE, DEFAULT_RISK_PCT } from '@shared/constants'
import type { AccountState } from '@shared/types'

export function createAccount(
  initialBalance = DEFAULT_BALANCE,
  riskPerTrade = DEFAULT_RISK_PCT,
  leverage = 1
): AccountState {
  return {
    initialBalance,
    balance: initialBalance,
    equity: initialBalance,
    riskPerTrade,
    leverage: Math.max(1, leverage)
  }
}

export function applyClosedTrade(account: AccountState, pnl: number): AccountState {
  const balance = account.balance + pnl
  return {
    ...account,
    balance,
    equity: balance
  }
}
