import { useState, useEffect } from "react";
import { Link, Navigate } from "react-router-dom";
import { apiRequest } from "@/shared/utils/apiClient";

interface ActiveSession {
  id: string;
  ipAddress: string;
  browser: string;
  os: string;
  createdAt: string;
  expiresAt: string;
}

export default function SessionsPage() {
  const userJson = localStorage.getItem("user");
  
  if (!userJson) {
    return <Navigate to="/login" replace />;
  }

  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    fetchSessions();
  }, []);

  async function fetchSessions() {
    setLoading(true);
    setError("");
    try {
      const result = await apiRequest("/sessions");
      setSessions(result.data);
    } catch (err: any) {
      setError(err.message || "Failed to load active sessions.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRevokeSession(sessionId: string) {
    setActionLoading(sessionId);
    setError("");
    try {
      await apiRequest(`/sessions/${sessionId}`, {
        method: "DELETE",
      });
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (err: any) {
      setError(err.message || "Failed to revoke session.");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRevokeOthers() {
    setActionLoading("others");
    setError("");
    try {
      await apiRequest("/sessions/revoke-others", {
        method: "POST",
      });
      // Re-fetch sessions to show only the current one remaining
      await fetchSessions();
    } catch (err: any) {
      setError(err.message || "Failed to revoke other sessions.");
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="page-center">
      <div className="card profile-card" style={{ maxWidth: "520px", width: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
          <Link to="/profile" style={{ color: "var(--color-accent)", textDecoration: "none", fontSize: "14px" }}>
            ← Back to Profile
          </Link>
          <span className="brand-logo" style={{ fontSize: "20px" }}>⬡</span>
        </div>

        <h1 className="profile-title" style={{ fontSize: "22px", textAlign: "left", marginBottom: "4px" }}>
          Active Sessions
        </h1>
        <p style={{ fontSize: "13px", color: "var(--color-muted)", marginBottom: "1.5rem" }}>
          Manage your active sessions on other devices and browsers.
        </p>

        {error && (
          <div className="form-error" role="alert" style={{ marginBottom: "1rem" }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: "center", padding: "2rem", color: "var(--color-muted)", fontSize: "14px" }}>
            Loading active sessions…
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem", width: "100%" }}>
            {sessions.length > 1 && (
              <button
                onClick={handleRevokeOthers}
                className="submit-btn"
                disabled={actionLoading !== null}
                style={{
                  backgroundColor: "rgba(239, 68, 68, 0.1)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  color: "#ef4444",
                  padding: "0.5rem 1rem",
                  fontSize: "13px",
                  borderRadius: "var(--radius)",
                  cursor: "pointer",
                  marginBottom: "0.5rem",
                }}
              >
                {actionLoading === "others" ? "Revoking others…" : "Log out of all other devices"}
              </button>
            )}

            {sessions.map((session) => (
              <div
                key={session.id}
                style={{
                  background: "rgba(255, 255, 255, 0.02)",
                  border: "1px solid rgba(255, 255, 255, 0.06)",
                  borderRadius: "var(--radius)",
                  padding: "1rem",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "1rem",
                }}
              >
                <div style={{ textAlign: "left" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ fontSize: "14px", fontWeight: "600", color: "var(--color-foreground)" }}>
                      {session.browser} on {session.os}
                    </span>
                  </div>
                  <span style={{ display: "block", fontSize: "12px", color: "var(--color-muted)", marginTop: "4px" }}>
                    IP: {session.ipAddress}
                  </span>
                  <span style={{ display: "block", fontSize: "11px", color: "var(--color-muted)", marginTop: "2px" }}>
                    Logged in: {new Date(session.createdAt).toLocaleString()}
                  </span>
                </div>

                <button
                  onClick={() => handleRevokeSession(session.id)}
                  disabled={actionLoading !== null}
                  style={{
                    background: "none",
                    border: "1px solid rgba(239, 68, 68, 0.2)",
                    borderRadius: "4px",
                    color: "#ef4444",
                    fontSize: "12px",
                    padding: "4px 8px",
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "rgba(239, 68, 68, 0.1)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  {actionLoading === session.id ? "Ending…" : "End Session"}
                </button>
              </div>
            ))}

            {sessions.length === 0 && (
              <div style={{ textAlign: "center", padding: "1.5rem", color: "var(--color-muted)", fontSize: "13px" }}>
                No active sessions found.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
