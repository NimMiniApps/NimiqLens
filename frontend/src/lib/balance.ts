import type { NimiqProvider } from './nimiq'

const LUNA_PER_NIM = 100_000

interface AccountByAddressResult {
  address: string
  balance: number
  type: string
}

type BalanceRpcProvider = Pick<NimiqProvider, 'getRPC'>

export function lunaToNim(luna: number): number {
  return luna / LUNA_PER_NIM
}

/** Reads NIM balance through Nimiq Pay's RPC (matches mainnet/testnet with the wallet). */
export async function fetchBalanceFromProvider(
  provider: BalanceRpcProvider,
  address: string,
): Promise<{ address: string; balance_nim: number }> {
  const rpc = provider.getRPC()
  if (!rpc) throw new Error('Wallet RPC unavailable')

  const account = await rpc.call<AccountByAddressResult>({
    jsonrpc: '2.0',
    method: 'getAccountByAddress',
    params: [address],
  })

  if (!account || typeof account.balance !== 'number') {
    throw new Error('Wallet returned an invalid balance response')
  }

  return {
    address: account.address ?? address,
    balance_nim: lunaToNim(account.balance),
  }
}
