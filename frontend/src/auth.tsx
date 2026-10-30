import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createClient, type Session, type User } from "@supabase/supabase-js";
import { Aperture, X } from "lucide-react";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const configured = Boolean(supabaseUrl && supabaseAnonKey);
const developmentBypass =
  import.meta.env.DEV && import.meta.env.VITE_AUTH_BYPASS === "true";
const supabase = configured
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : null;

type AuthState = {
  session: Session | null;
  user: User | null;
  role: string;
  signedIn: boolean;
  mfaFactorId: string;
  verifyMfa: (code: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [mfaFactorId, setMfaFactorId] = useState("");
  // Analysis is public, so the page never waits on session restore.
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    async function applySession(next: Session | null) {
      let pendingFactor = "";
      if (next) {
        const [factors, assurance] = await Promise.all([
          supabase!.auth.mfa.listFactors(),
          supabase!.auth.mfa.getAuthenticatorAssuranceLevel(),
        ]);
        const verified = factors.data?.totp.find((factor) => factor.status === "verified");
        if (verified && assurance.data?.currentLevel !== "aal2") pendingFactor = verified.id;
      }
      if (!active) return;
      setSession(next);
      setMfaFactorId(pendingFactor);
    }
    void supabase.auth.getSession().then(({ data }) => applySession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => { void applySession(next); });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);
  const value = useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,
      role: String(session?.user.app_metadata?.role ?? "authenticated"),
      signedIn: developmentBypass || Boolean(session && !mfaFactorId),
      mfaFactorId,
      verifyMfa: async (code: string) => {
        if (!supabase || !mfaFactorId) throw new Error("MFA challenge is unavailable");
        const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: mfaFactorId, code: code.trim() });
        if (error) throw error;
        setMfaFactorId("");
      },
      signOut: async () => {
        if (supabase) await supabase.auth.signOut();
      },
    }),
    [session, mfaFactorId],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}

// Sign-in is only needed to record a review or approval.
export function SignInDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="auth-shell auth-overlay" role="dialog" aria-modal="true" aria-label="Sign in">
      <div className="auth-dialog">
        <button type="button" className="icon-button auth-close" aria-label="Close sign-in" onClick={onClose}>
          <X size={18} />
        </button>
        <SignInCard />
      </div>
    </div>
  );
}

function SignInCard() {
  const { session, mfaFactorId, verifyMfa, signOut } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  if (!configured) {
    return (
      <section className="auth-card">
        <Aperture size={34} />
        <h1>Authentication is not configured</h1>
        <p>Connect the approved Supabase project before recording reviews or approvals.</p>
      </section>
    );
  }
  if (session && mfaFactorId) {
    async function submitMfa(event: React.FormEvent) {
      event.preventDefault();
      setBusy(true);
      setError("");
      try {
        await verifyMfa(mfaCode);
      } catch {
        setError("Verification failed. Check the current code and try again.");
      } finally {
        setBusy(false);
      }
    }
    return (
        <section className="auth-card">
          <div className="auth-brand"><Aperture size={30} /> DataLens</div>
          <span className="eyebrow">MULTI-FACTOR VERIFICATION</span>
          <h1>Confirm your secure session</h1>
          <p>Enter the current code from the authenticator connected to your Nexus account.</p>
          <form onSubmit={(event) => void submitMfa(event)}>
            <label htmlFor="auth-mfa">Authenticator code</label>
            <input id="auth-mfa" inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}" maxLength={6} value={mfaCode} onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, ""))} />
            {error && <p className="auth-error" role="alert">{error}</p>}
            <button className="primary" disabled={busy || mfaCode.length !== 6}>{busy ? "Verifying…" : "Verify"}</button>
          </form>
          <button type="button" onClick={() => void signOut()}>Sign out</button>
        </section>
    );
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const { error: signInError } = await supabase!.auth.signInWithPassword({ email, password });
    if (signInError) setError("Sign-in failed. Check your Nexus account credentials.");
    setBusy(false);
  }
  return (
      <section className="auth-card">
        <div className="auth-brand"><Aperture size={30} /> DataLens</div>
        <span className="eyebrow">REVIEW ACCESS</span>
        <h1>Sign in with your Nexus account</h1>
        <p>Analysis works without an account. Sign in to record a formal review or internal approval.</p>
        <form onSubmit={(event) => void submit(event)}>
          <label htmlFor="auth-email">Email</label>
          <input id="auth-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          <label htmlFor="auth-password">Password</label>
          <input id="auth-password" type="password" autoComplete="current-password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} />
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="primary" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        </form>
        <div className="auth-links">
          <a href="https://nexus-lemon-eight-32.vercel.app/forgot-password">Forgot password?</a>
          <a href="https://nexus-lemon-eight-32.vercel.app/projects">Back to Nexus</a>
        </div>
      </section>
  );
}
