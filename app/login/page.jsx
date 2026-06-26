"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { useRouter } from "next/navigation";

const C = {
  bg: "#EFF6FF",
  ink: "#0A1F3C",
  muted: "#4A6A8A",
  accent: "#0077C8",
  line: "#C8DFF2",
  risk: "#B03030",
};

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    // Import and create client inside the handler — avoids SSR/build-time issues
    const { createClient } = await import("../../lib/supabase");
    const supabase = createClient();

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push("/");
      router.refresh();
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 380, background: "#fff", borderRadius: 16, padding: 36, border: `1px solid ${C.line}` }}>
        <img src="/amn_logo_blue.png" alt="the amn" style={{ height: 28, marginBottom: 24 }} />
        <h1 style={{ fontFamily: "Spectral, Georgia, serif", fontSize: 24, color: C.ink, marginBottom: 6 }}>
          SEO Progress
        </h1>
        <p style={{ color: C.muted, fontSize: 13.5, marginBottom: 28 }}>
          Sign in to your account
        </p>
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", color: C.muted, fontSize: 12, marginBottom: 6, fontWeight: 500 }}>EMAIL</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{ width: "100%", padding: "10px 12px", border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 14, color: C.ink, boxSizing: "border-box", outline: "none", fontFamily: "Inter, system-ui, sans-serif" }}
            />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", color: C.muted, fontSize: 12, marginBottom: 6, fontWeight: 500 }}>PASSWORD</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{ width: "100%", padding: "10px 12px", border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 14, color: C.ink, boxSizing: "border-box", outline: "none", fontFamily: "Inter, system-ui, sans-serif" }}
            />
          </div>
          {error && <p style={{ color: C.risk, fontSize: 13, marginBottom: 16 }}>{error}</p>}
          <button
            type="submit"
            disabled={loading}
            style={{ width: "100%", padding: "11px", background: C.accent, color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: loading ? "default" : "pointer", opacity: loading ? 0.7 : 1, fontFamily: "Inter, system-ui, sans-serif" }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
