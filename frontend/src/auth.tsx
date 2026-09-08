import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createClient, type Session, type User } from "@supabase/supabase-js";
import { Aperture } from "lucide-react";

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
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!configured);
  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);
  const value = useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,
      role: String(session?.user.app_metadata?.role ?? "authenticated"),
      signOut: async () => {
        if (supabase) await supabase.auth.signOut();
      },
    }),
    [session],
  );
  if (!ready) return <div className="auth-loading">Checking your secure session…</div>;
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (developmentBypass) return children;
  if (!configured) {
    return (
      <div className="auth-shell">
        <section className="auth-card">
          <Aperture size={34} />
          <h1>Authentication is not configured</h1>
          <p>Connect the approved Supabase project before analyzing organizational data.</p>
        </section>
      </div>
    );
  }
  if (session) return children;
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const { error: signInError } = await supabase!.auth.signInWithPassword({ email, password });
    if (signInError) setError("Sign-in failed. Check your Nexus account credentials.");
    setBusy(false);
  }
  return (
    <div className="auth-shell">
      <section className="auth-card">
        <div className="auth-brand"><Aperture size={30} /> DataLens</div>
        <span className="eyebrow">ENTERPRISE ACCESS</span>
        <h1>Sign in with your Nexus account</h1>
        <p>Profile a CSV, check structural quality, and create a reviewable draft. This release accepts synthetic or confirmed non-personal data only.</p>
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
    </div>
  );
}
