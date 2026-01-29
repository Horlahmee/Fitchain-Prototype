import 'react-native-url-polyfill/auto';
import 'react-native-get-random-values';
import '@ethersproject/shims';
import 'fast-text-encoding';

import React, { useMemo, useState } from 'react';
import { SafeAreaView, View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

import { PrivyProvider, usePrivy, useLoginWithOAuth, useEmbeddedEthereumWallet } from '@privy-io/expo';

const extra = (Constants.expoConfig?.extra ?? {}) as any;
const API_BASE_URL: string = extra.apiBaseUrl || 'http://localhost:4000';
const PRIVY_APP_ID: string = extra.privyAppId;
const PRIVY_CLIENT_ID: string = extra.privyClientId;

const ACCESS_KEY = 'fit_access_token';
const REFRESH_KEY = 'fit_refresh_token';

async function apiFetch(path: string, init?: RequestInit, accessToken?: string) {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(init?.headers as any),
  };

  if (accessToken) headers.authorization = `Bearer ${accessToken}`;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // ignore
  }

  if (!res.ok) {
    const msg = json?.error || `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return json;
}

async function saveTokens(accessToken: string, refreshToken: string) {
  await SecureStore.setItemAsync(ACCESS_KEY, accessToken);
  await SecureStore.setItemAsync(REFRESH_KEY, refreshToken);
}

async function loadAccessToken() {
  return SecureStore.getItemAsync(ACCESS_KEY);
}

function InnerApp() {
  const { isReady, user } = usePrivy();
  const authenticated = !!user;

  const { wallets, create } = useEmbeddedEthereumWallet();
  const { login } = useLoginWithOAuth();

  const [status, setStatus] = useState('');

  const evmAddress = useMemo(() => {
    const addr = wallets?.[0]?.address;
    return typeof addr === 'string' ? addr : null;
  }, [wallets]);

  async function doLogin() {
    setStatus('Opening login…');
    // Use OAuth (Google) for now. We can add email later.
    await login({ provider: 'google' as any });
    setStatus('Logged in. Creating wallet…');

    // Ensure an embedded EVM wallet exists immediately after login
    if (!wallets?.length) {
      await create();
    }

    setStatus('Logged in');
  }

  async function bindToBackend() {
    if (!evmAddress) throw new Error('Wallet not ready yet');

    // TEMP: use email-only backend auth until we unify auth with Privy.
    // For now, we create/upsert the user by wallet.
    const json = await apiFetch('/me', {
      method: 'POST',
      body: JSON.stringify({ wallet: evmAddress }),
    });

    setStatus(`Backend user: ${json.user?.id || 'ok'}`);
  }

  async function me() {
    const accessToken = await loadAccessToken();
    if (!accessToken) return Alert.alert('Not logged in to backend JWT yet');
    const json = await apiFetch('/auth/me', { method: 'GET' }, accessToken);
    Alert.alert('Me', JSON.stringify(json.user, null, 2));
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.h1}>FitChain Mobile</Text>
        <Text style={styles.p}>API: {API_BASE_URL}</Text>
        <Text style={styles.p}>Privy ready: {String(isReady)}</Text>
        <Text style={styles.p}>Privy authenticated: {String(authenticated)}</Text>
        <Text style={styles.p}>Wallet: {evmAddress || '(not ready)'}</Text>
        <Text style={styles.p}>Status: {status}</Text>

        {!authenticated ? (
          <Pressable style={styles.btn} onPress={() => doLogin().catch(e => Alert.alert('Error', e.message))}>
            <Text style={styles.btnText}>Login with Privy</Text>
          </Pressable>
        ) : (
          <>
            <Pressable style={styles.btn} onPress={() => bindToBackend().catch(e => Alert.alert('Error', e.message))}>
              <Text style={styles.btnText}>Bind wallet to backend</Text>
            </Pressable>

            <Pressable style={styles.btnOutline} onPress={() => me().catch(e => Alert.alert('Error', e.message))}>
              <Text style={styles.btnText}>Call /auth/me (backend JWT)</Text>
            </Pressable>

            <Text style={styles.small}>
              Next: replace backend auth with Privy token verification + add claim button.
            </Text>
          </>
        )}

        <Text style={styles.small}>User: {user ? 'yes' : 'no'}</Text>
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  if (!PRIVY_APP_ID || !PRIVY_CLIENT_ID) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.container}>
          <Text style={styles.h1}>FitChain Mobile</Text>
          <Text style={styles.p}>Missing Privy config in app.json (privyAppId / privyClientId).</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <PrivyProvider appId={PRIVY_APP_ID} clientId={PRIVY_CLIENT_ID}>
      <InnerApp />
    </PrivyProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0B1220' },
  container: { flex: 1, padding: 16, gap: 12 },
  h1: { color: 'white', fontSize: 22, fontWeight: '700' },
  p: { color: '#C8D1E0' },
  small: { color: '#9FB0CC', fontSize: 12, marginTop: 6 },
  btn: { backgroundColor: '#2E6BFF', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  btnOutline: { borderColor: '#2E6BFF', borderWidth: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  btnText: { color: 'white', fontWeight: '700' },
});
