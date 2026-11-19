import { useState } from "react";
import { Icon } from "./Shared";

export function Lock({
  onUnlock,
}: {
  onUnlock: (password: string) => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError("");
    try {
      await onUnlock(password);
    } catch {
      setError("That password didn't work. Try again.");
      setPassword("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="lock-screen">
      <form className="card lock-card" onSubmit={submit}>
        <div className="lock-icon">{Icon.Lock}</div>
        <h1>Your journal is protected</h1>
        <p>Enter your password to open your journal.</p>
        <input
          className="input"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
        <div className="lock-error">{error}</div>
        <button className="btn btn-primary" style={{ width: "100%", marginTop: 8 }} disabled={busy || !password}>
          {busy ? "Unlocking…" : "Unlock"}
        </button>
      </form>
    </div>
  );
}
