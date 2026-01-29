import 'react-native-url-polyfill/auto';
import React, { useMemo, useState } from 'react';
import { SafeAreaView, View, Text, TextInput, Pressable, StyleSheet, Alert } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as AuthSession from 'expo-auth-session';
import Constants from 'expo-constants';

type Tokens = { accessToken: string; refreshToken: string };

const extra = (Constants.expoConfig?.extra ?? {}) as any;
const API_BASE_URL: string = extra.apiBaseUrl || 'http://localhost:4000';
const GOOGLE_CLIENT_ID_WEB: string = extra.googleClientIdWeb;
const GOOGLE_CLIENT_ID_IOS: string = extra.googleClientIdIos;

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

export default function App() {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [wallet, setWallet] = useState('0x');
  const [status, setStatus] = useState<string>('Not logged in');
  // Dev-time: hardcode Expo Auth proxy redirect to avoid exp:// redirect_uri mismatches.
  // NOTE: this must match the Authorized redirect URI set in Google Cloud Console.
  const redirectUri = 'https://auth.expo.io/@fitchain/fitchain';
  console.log('redirectUri', redirectUri);

  async function saveTokens(t: Tokens) {
    await SecureStore.setItemAsync(ACCESS_KEY, t.accessToken);
    await SecureStore.setItemAsync(REFRESH_KEY, t.refreshToken);
  }

  async function loadAccessToken() {
    return SecureStore.getItemAsync(ACCESS_KEY);
  }

  async function startEmailOtp() {
    await apiFetch('/auth/email/start', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    setStatus('OTP sent (check server logs for now)');
  }

  async function verifyEmailOtp() {
    const json = await apiFetch('/auth/email/verify', {
      method: 'POST',
      body: JSON.stringify({ email, code: otp, wallet }),
    });

    await saveTokens({ accessToken: json.accessToken, refreshToken: json.refreshToken });
    setStatus(`Logged in via email: user=${json.user.id}`);
  }

  async function googleLogin() {
    // When using the Expo Auth proxy redirect (auth.expo.io), use the Web client id.
    // Platform (iOS/Android) client ids are for native scheme redirects in standalone builds.
    const clientId = GOOGLE_CLIENT_ID_WEB;
    if (!clientId) throw new Error('Missing googleClientIdWeb in app.json');

    // Use Authorization Code flow (with PKCE) and then exchange code for tokens to get id_token.
    const discovery = {
      authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenEndpoint: 'https://oauth2.googleapis.com/token',
    };

    const request = new (AuthSession as any).AuthRequest({
      clientId,
      redirectUri,
      responseType: (AuthSession as any).ResponseType?.Code ?? 'code',
      scopes: ['openid', 'email', 'profile'],
      usePKCE: true,
      extraParams: {
        // Required by Google when requesting OpenID claims
        nonce: String(Date.now()),
        // Recommended for installed apps
        prompt: 'select_account',
      },
    });

    const result: any = await request.promptAsync(discovery, { useProxy: true });
    if (!result || result.type !== 'success') return;

    const code = result.params?.code;
    if (!code) throw new Error('Missing code in Google response');

    const tokenRes = await (AuthSession as any).exchangeCodeAsync(
      {
        clientId,
        code,
        redirectUri,
        extraParams: {
          code_verifier: request.codeVerifier,
        },
      },
      discovery,
    );

    const idToken = tokenRes?.idToken || tokenRes?.id_token;
    if (!idToken) throw new Error('Missing id_token after token exchange');

    const json = await apiFetch('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ idToken, wallet }),
    });

    await saveTokens({ accessToken: json.accessToken, refreshToken: json.refreshToken });
    setStatus(`Logged in via Google: user=${json.user.id}`);
  }

  async function me() {
    const accessToken = await loadAccessToken();
    if (!accessToken) return Alert.alert('Not logged in');

    const json = await apiFetch('/auth/me', { method: 'GET' }, accessToken);
    Alert.alert('Me', JSON.stringify(json.user, null, 2));
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.h1}>FitChain Mobile (scaffold)</Text>
        <Text style={styles.p}>API: {API_BASE_URL}</Text>
        <Text style={styles.p}>Redirect URI: {redirectUri}</Text>
        <Text style={styles.p}>Status: {status}</Text>

        <View style={styles.card}>
          <Text style={styles.h2}>Wallet address (temporary)</Text>
          <TextInput style={styles.input} value={wallet} onChangeText={setWallet} autoCapitalize="none" />
          <Text style={styles.small}>
            For now, paste any test address. Later this will be Coinbase Smart Wallet address created on-device.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.h2}>Email OTP</Text>
          <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" placeholder="email" />
          <Pressable style={styles.btn} onPress={() => startEmailOtp().catch(e => Alert.alert('Error', e.message))}>
            <Text style={styles.btnText}>Send OTP</Text>
          </Pressable>
          <TextInput style={styles.input} value={otp} onChangeText={setOtp} placeholder="OTP code" keyboardType="number-pad" />
          <Pressable style={styles.btn} onPress={() => verifyEmailOtp().catch(e => Alert.alert('Error', e.message))}>
            <Text style={styles.btnText}>Verify OTP</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.h2}>Google</Text>
          <Pressable style={styles.btn} onPress={() => googleLogin().catch(e => Alert.alert('Error', e.message))}>
            <Text style={styles.btnText}>Sign in with Google</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Pressable style={styles.btnOutline} onPress={() => me().catch(e => Alert.alert('Error', e.message))}>
            <Text style={styles.btnText}>Call /auth/me</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0B1220' },
  container: { flex: 1, padding: 16, gap: 12 },
  h1: { color: 'white', fontSize: 22, fontWeight: '700' },
  h2: { color: 'white', fontSize: 16, fontWeight: '600', marginBottom: 8 },
  p: { color: '#C8D1E0' },
  small: { color: '#9FB0CC', fontSize: 12, marginTop: 6 },
  card: { backgroundColor: '#121B2F', padding: 12, borderRadius: 12, borderColor: '#1E2A47', borderWidth: 1 },
  input: {
    backgroundColor: '#0B1220',
    color: 'white',
    borderColor: '#1E2A47',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  btn: { backgroundColor: '#2E6BFF', paddingVertical: 12, borderRadius: 10, alignItems: 'center', marginBottom: 10 },
  btnOutline: { borderColor: '#2E6BFF', borderWidth: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  btnText: { color: 'white', fontWeight: '700' },
});
