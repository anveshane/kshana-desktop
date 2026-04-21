import Store from 'electron-store';
import type { AccountInfo } from '../shared/settingsTypes';

interface AccountStore {
  account: AccountInfo | null;
}

const accountStore = new Store<AccountStore>({
  name: 'kshana-account',
  defaults: {
    account: null,
  },
});

export function getAccount(): AccountInfo | null {
  return accountStore.get('account', null) ?? null;
}

export function setAccount(info: AccountInfo): void {
  accountStore.set('account', info);
}

export function clearAccount(): void {
  accountStore.set('account', null);
}

/** Fetches the latest balance from Kshana Cloud and updates the stored account. */
export async function refreshBalance(cloudUrl: string): Promise<number | null> {
  const account = getAccount();
  if (!account) return null;
  try {
    const res = await fetch(`${cloudUrl}/api/credits/balance`, {
      headers: { Authorization: `Bearer ${account.token}` },
    });
    if (!res.ok) return null;
    const { balance } = await res.json() as { balance: number };
    setAccount({ ...account, credits: balance });
    return balance;
  } catch {
    return null;
  }
}
