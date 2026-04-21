import { useCallback, useEffect, useState } from 'react';
import type { AccountInfo } from '../../../shared/settingsTypes';
import styles from './SettingsPanel.module.scss';

export default function AccountTab() {
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadAccount = useCallback(async () => {
    const info = await window.electron.account.get();
    setAccount(info);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAccount();
    // Subscribe to changes triggered by deep-link callback
    return window.electron.account.onChange((info) => {
      setAccount(info);
    });
  }, [loadAccount]);

  const handleSignIn = async () => {
    setSigningIn(true);
    await window.electron.account.signIn();
    // The deep-link handler in main.ts will fire account:changed which updates state
    setSigningIn(false);
  };

  const handleSignOut = async () => {
    await window.electron.account.signOut();
    setAccount(null);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await window.electron.account.refreshBalance();
    await loadAccount();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <div className={styles.sectionHeader}>
        <p style={{ color: 'var(--graphite-350)', fontSize: '0.875rem' }}>
          Loading account…
        </p>
      </div>
    );
  }

  if (!account) {
    return (
      <div>
        <div className={styles.sectionHeader}>
          <h3>Kshana Cloud Account</h3>
          <p>
            Sign in to sync sessions, track credits, and buy more when you need them.
          </p>
        </div>

        <div className={styles.infoCard} style={{ marginTop: '1.25rem' }}>
          <div className={styles.infoTitle}>Not signed in</div>
          <p className={styles.infoText}>
            Clicking &quot;Sign in&quot; opens your browser to complete sign-in securely.
            The desktop app will be authorised automatically.
          </p>
          <button
            type="button"
            className={styles.submitButton}
            style={{ marginTop: '1rem' }}
            onClick={handleSignIn}
            disabled={signingIn}
          >
            {signingIn ? 'Opening browser…' : 'Sign in with Kshana'}
          </button>
        </div>
      </div>
    );
  }

  const initials = (account.name ?? account.email)
    .split(' ')
    .map((s: string) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div>
      <div className={styles.sectionHeader}>
        <h3>Kshana Cloud Account</h3>
        <p>Your cloud account, credit balance, and session sync.</p>
      </div>

      {/* Profile card */}
      <div className={styles.statusCard} style={{ marginTop: '1.25rem' }}>
        <div className={styles.statusTopRow}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
            <div
              style={{
                width: '2.5rem',
                height: '2.5rem',
                borderRadius: '50%',
                background: 'var(--signal-cyan)',
                color: '#030508',
                fontWeight: 700,
                fontSize: '1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {initials}
            </div>
            <div>
              {account.name && (
                <div style={{ fontWeight: 600, color: 'var(--foreground)', fontSize: '0.9rem' }}>
                  {account.name}
                </div>
              )}
              <div style={{ fontSize: '0.8rem', color: 'var(--graphite-350)' }}>
                {account.email}
              </div>
            </div>
          </div>
          <div
            className={`${styles.statusBadge} ${styles.statusBadgeSuccess}`}
            style={{ flexShrink: 0 }}
          >
            <span className={styles.statusDot} />
            Signed in
          </div>
        </div>
      </div>

      {/* Credit balance */}
      <div style={{ marginTop: '1.25rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '0.5rem',
          }}
        >
          <span
            style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--graphite-350)', textTransform: 'uppercase', letterSpacing: '0.06em' }}
          >
            Credit Balance
          </span>
          <button
            type="button"
            className={styles.cancelButton}
            style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        <div
          style={{
            padding: '1rem 1.25rem',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '0.75rem',
            display: 'flex',
            alignItems: 'baseline',
            gap: '0.5rem',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '2rem',
              color: 'var(--kshana-green, #34d399)',
              lineHeight: 1,
            }}
          >
            {account.credits.toLocaleString()}
          </span>
          <span style={{ fontSize: '0.85rem', color: 'var(--graphite-350)' }}>
            credits remaining
          </span>
        </div>
        <p className={styles.infoText} style={{ marginTop: '0.5rem' }}>
          Buy more credits at{' '}
          <a
            href="https://kshana.app/billing"
            target="_blank"
            rel="noreferrer"
            style={{ color: 'var(--signal-cyan)' }}
          >
            kshana.app/billing
          </a>
        </p>
      </div>

      {/* Sign out */}
      <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <button
          type="button"
          className={styles.cancelButton}
          onClick={handleSignOut}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
