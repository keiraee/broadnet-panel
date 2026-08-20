export type SessionStatus = 'anonymous' | 'authenticated' | 'expired'

export interface QuotaItem {
  name: string
  used: number
  remain: number
  total: number
  unit: 'G' | '分钟' | '条'
  tag?: string
}

export interface ExtraFeeItem {
  name: string
  usage: string
  fee: number
}

export interface AccountSnapshot {
  phone: string
  packageName: string
  balance: number
  monthSpend: number
  cashBalance: number
  giftBalance: number
  quotas: QuotaItem[]
  extras: ExtraFeeItem[]
  updatedAt: string
}

export interface AuthState {
  loggedIn: boolean
  phone: string
  session: SessionStatus
}
