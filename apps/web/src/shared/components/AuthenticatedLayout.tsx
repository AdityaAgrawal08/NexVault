import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { apiRequest, clearSession } from "@/shared/utils/apiClient";

interface AuthenticatedLayoutProps {
  children: React.ReactNode;
}

interface UserProfile {
  id: string;
  username: string;
  email: string;
  phoneNumber?: string;
  role?: string;
}

export default function AuthenticatedLayout({ children }: AuthenticatedLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  
  // Simulated Create Item Modal State
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [itemTitle, setItemTitle] = useState("");
  const [itemCategory, setItemCategory] = useState("document");
  const [itemError, setItemError] = useState("");
  const [itemSuccess, setItemSuccess] = useState("");

  useEffect(() => {
    const userJson = localStorage.getItem("user");
    if (!userJson) {
      navigate("/login");
      return;
    }
    try {
      setUser(JSON.parse(userJson));
    } catch (e) {
      clearSession();
      navigate("/login");
    }

    // Refresh profile details from the new backend endpoint to get the latest username/email
    async function fetchLatestProfile() {
      try {
        const response = await apiRequest("/profile");
        if (response && response.data) {
          setUser(response.data);
          localStorage.setItem("user", JSON.stringify(response.data));
        }
      } catch (err) {
        console.error("Failed to sync profile:", err);
      }
    }

    fetchLatestProfile();
  }, [navigate, location.pathname]);

  // Close drawer on route change
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  const handleCreateItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemTitle.trim()) {
      setItemError("Title is required.");
      return;
    }

    const itemsJson = localStorage.getItem("nexvault_items");
    let items = [];
    if (itemsJson) {
      try {
        items = JSON.parse(itemsJson);
      } catch (e) {
        items = [];
      }
    }

    const newItem = {
      id: Math.random().toString(36).substring(2, 9),
      title: itemTitle.trim(),
      category: itemCategory,
      createdAt: new Date().toISOString(),
    };

    items.unshift(newItem);
    localStorage.setItem("nexvault_items", JSON.stringify(items));
    
    // Dispatch a custom event so the dashboard can refresh automatically
    window.dispatchEvent(new Event("nexvault_item_added"));

    setItemSuccess("Item created successfully!");
    setItemTitle("");
    setTimeout(() => {
      setItemSuccess("");
      setAddModalOpen(false);
    }, 1200);
  };

  if (!user) return null;

  const initials = user.username.substring(0, 2).toUpperCase();

  return (
    <div className="auth-layout-container">
      {/* Dynamic Scoped CSS */}
      <style>{`
        .auth-layout-container {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          background-color: var(--color-bg);
          color: var(--color-text);
          position: relative;
        }

        .auth-header {
          display: flex;
          align-items: center;
          padding: 1rem 2rem;
          background: rgba(22, 27, 34, 0.7);
          backdrop-filter: blur(12px);
          border-bottom: 1px solid var(--color-border);
          position: sticky;
          top: 0;
          z-index: 100;
          gap: 1.5rem;
        }

        .hamburger-btn {
          background: none;
          border: 1px solid var(--color-border);
          border-radius: 6px;
          color: var(--color-text);
          font-size: 1.25rem;
          padding: 0.5rem 0.75rem;
          cursor: pointer;
          transition: all var(--transition-fast);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .hamburger-btn:hover {
          background: rgba(255, 255, 255, 0.05);
          border-color: var(--color-muted);
          transform: scale(1.05);
        }

        .welcome-msg {
          font-size: 1.1rem;
          font-weight: 500;
          color: var(--color-text);
          margin: 0;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .welcome-name {
          color: var(--color-accent);
          font-weight: 600;
        }

        /* Drawer Overlay Backdrop */
        .drawer-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(4px);
          z-index: 900;
          opacity: 0;
          pointer-events: none;
          transition: opacity var(--transition-normal);
        }

        .drawer-backdrop.open {
          opacity: 1;
          pointer-events: auto;
        }

        /* Slide-out Drawer */
        .drawer-container {
          position: fixed;
          top: 0;
          left: 0;
          bottom: 0;
          width: 280px;
          background: #11151c;
          border-right: 1px solid var(--color-border);
          box-shadow: 20px 0 30px rgba(0, 0, 0, 0.5);
          z-index: 950;
          transform: translateX(-100%);
          transition: transform 350ms cubic-bezier(0.16, 1, 0.3, 1);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 1.5rem 1rem;
        }

        .drawer-container.open {
          transform: translateX(0);
        }

        .drawer-top-section {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .drawer-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-bottom: 1rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        .drawer-title {
          font-size: 1.2rem;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--color-text);
        }

        .close-drawer-btn {
          background: none;
          border: none;
          color: var(--color-muted);
          font-size: 1.5rem;
          cursor: pointer;
          padding: 4px 8px;
          border-radius: 4px;
        }

        .close-drawer-btn:hover {
          color: var(--color-text);
          background: rgba(255, 255, 255, 0.05);
        }

        .primary-action-btn {
          width: 100%;
          padding: 0.8rem;
          background: var(--color-accent);
          color: white;
          border: none;
          border-radius: var(--radius);
          font-size: 0.95rem;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.2);
          transition: all var(--transition-fast);
        }

        .primary-action-btn:hover {
          background: var(--color-accent-hover);
          box-shadow: 0 4px 16px rgba(59, 130, 246, 0.35);
          transform: translateY(-1px);
        }

        .drawer-nav-items {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          margin-top: 1rem;
        }

        .nav-item-link {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem 1rem;
          border-radius: var(--radius);
          color: var(--color-muted);
          text-decoration: none;
          font-weight: 500;
          font-size: 0.95rem;
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .nav-item-link:hover, .nav-item-link.active {
          color: var(--color-text);
          background: rgba(255, 255, 255, 0.03);
        }

        .drawer-bottom-section {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
          padding-top: 1.25rem;
        }

        .user-profile-section {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.5rem;
          border-radius: var(--radius);
          cursor: pointer;
          transition: all var(--transition-fast);
          text-align: left;
        }

        .user-profile-section:hover {
          background: rgba(255, 255, 255, 0.04);
        }

        .drawer-avatar {
          width: 42px;
          height: 42px;
          border-radius: 50%;
          background: linear-gradient(135deg, var(--color-accent) 0%, #a855f7 100%);
          color: white;
          font-size: 1rem;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
        }

        .user-details {
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .user-name {
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--color-text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .user-email {
          font-size: 0.75rem;
          color: var(--color-muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .drawer-settings-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          width: 100%;
          padding: 0.7rem;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--color-border);
          border-radius: var(--radius);
          color: var(--color-text);
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .drawer-settings-btn:hover {
          background: rgba(255, 255, 255, 0.07);
          border-color: var(--color-muted);
        }

        .main-content-area {
          flex: 1;
          width: 100%;
          box-sizing: border-box;
        }

        /* Add Item Modal Styling */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.8);
          backdrop-filter: blur(6px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2000;
          padding: 1rem;
        }

        .add-modal-card {
          width: 100%;
          max-width: 440px;
          background: var(--color-card);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          padding: 2rem;
          position: relative;
        }

        .modal-close-btn {
          position: absolute;
          top: 1rem;
          right: 1.25rem;
          background: none;
          border: none;
          color: var(--color-muted);
          font-size: 1.5rem;
          cursor: pointer;
        }

        .modal-close-btn:hover {
          color: var(--color-text);
        }

        /* Adaptive width on larger screens */
        @media (min-width: 1024px) {
          .drawer-container {
            width: 300px;
          }
        }
      `}</style>

      {/* Top Header */}
      <header className="auth-header">
        <button
          className="hamburger-btn"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open navigation drawer"
        >
          ☰
        </button>
        <h2 className="welcome-msg">
          Welcome, <span className="welcome-name">{user.username}</span>
        </h2>
      </header>

      {/* Slide-out Navigation Drawer */}
      <div
        className={`drawer-backdrop ${drawerOpen ? "open" : ""}`}
        onClick={() => setDrawerOpen(false)}
      />
      <aside className={`drawer-container ${drawerOpen ? "open" : ""}`}>
        <div className="drawer-top-section">
          <div className="drawer-header">
            <span className="drawer-title">
              <span style={{ color: "var(--color-accent)" }}>⬡</span> NexVault
            </span>
            <button
              className="close-drawer-btn"
              onClick={() => setDrawerOpen(false)}
            >
              &times;
            </button>
          </div>

          {/* Primary Action Button */}
          <button
            className="primary-action-btn"
            onClick={() => {
              setAddModalOpen(true);
              setDrawerOpen(false);
            }}
          >
            <span>+</span> Add More
          </button>

          {/* Navigation Links */}
          <nav className="drawer-nav-items">
            <div
              className={`nav-item-link ${location.pathname === "/dashboard" ? "active" : ""}`}
              onClick={() => navigate("/dashboard")}
              style={{ cursor: "pointer" }}
            >
              📁 Dashboard
            </div>
            <div
              className={`nav-item-link ${location.pathname === "/profile" ? "active" : ""}`}
              onClick={() => navigate("/profile")}
              style={{ cursor: "pointer" }}
            >
              👤 Profile & Settings
            </div>
          </nav>
        </div>

        {/* Bottom Section */}
        <div className="drawer-bottom-section">
          {/* User Section */}
          <div
            className="user-profile-section"
            onClick={() => navigate("/profile")}
            title="View Account Page"
          >
            <div className="drawer-avatar">{initials}</div>
            <div className="user-details">
              <span className="user-name">{user.username}</span>
              <span className="user-email">{user.email}</span>
            </div>
          </div>

          {/* Settings Shortcut Button */}
          <button
            className="drawer-settings-btn"
            onClick={() => navigate("/profile")}
          >
            ⚙️ Account Settings
          </button>
        </div>
      </aside>

      {/* Main Content View */}
      <main className="main-content-area">{children}</main>

      {/* Add New Item Modal */}
      {addModalOpen && (
        <div className="modal-overlay">
          <div className="add-modal-card">
            <button
              className="modal-close-btn"
              onClick={() => setAddModalOpen(false)}
            >
              &times;
            </button>
            <h3 className="card-title" style={{ textAlign: "left", marginBottom: "1rem" }}>
              Add New Item
            </h3>
            
            {itemError && <div className="form-error">{itemError}</div>}
            {itemSuccess && <div className="form-success">{itemSuccess}</div>}

            <form onSubmit={handleCreateItem}>
              <div className="field">
                <label htmlFor="itemName">Item Title</label>
                <input
                  id="itemName"
                  type="text"
                  placeholder="e.g. Work Email Key, Personal Notes..."
                  value={itemTitle}
                  onChange={(e) => {
                    setItemTitle(e.target.value);
                    setItemError("");
                  }}
                  autoFocus
                  required
                />
              </div>

              <div className="field">
                <label htmlFor="itemCategory">Category</label>
                <select
                  id="itemCategory"
                  value={itemCategory}
                  onChange={(e) => setItemCategory(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius)",
                    fontSize: "14px",
                    color: "var(--color-text)",
                    background: "var(--color-bg)",
                    outline: "none",
                  }}
                >
                  <option value="document">📄 Document / Note</option>
                  <option value="project">📁 Project</option>
                  <option value="key">🔑 Safe Key / Credential</option>
                  <option value="file">📦 Vault File</option>
                </select>
              </div>

              <button type="submit" className="submit-btn" style={{ marginTop: "1rem" }}>
                Create Item
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
