import { DEFAULT_BALANCE, DEFAULT_RISK_PCT } from '@shared/constants'
import type { AccountState } from '@shared/types'

export function createAccount(
  initialBalance = DEFAULT_BALANCE,
  riskPerTrade = DEFAULT_RISK_PCT
): AccountState {
  return {
    initialBalance,
    balance: initialBalance,
    equity: initialBalance,
    riskPerTrade
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
