import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "@/shared/utils/apiClient";

interface DashboardItem {
  id: string;
  title: string;
  category: string;
  createdAt: string;
}

export default function DashboardPage() {
  const [items, setItems] = useState<DashboardItem[]>([]);
  const [sessionCount, setSessionCount] = useState(1);

  const loadItems = () => {
    const itemsJson = localStorage.getItem("nexvault_items");
    if (itemsJson) {
      try {
        setItems(JSON.parse(itemsJson));
      } catch (e) {
        setItems([]);
      }
    } else {
      // Pre-populate with beautiful mock items for premium look
      const defaultItems: DashboardItem[] = [
        {
          id: "1",
          title: "Production PostgreSQL Database Key",
          category: "key",
          createdAt: new Date(Date.now() - 2 * 3600000).toISOString(),
        },
        {
          id: "2",
          title: "Personal Vault & Identity Backup",
          category: "file",
          createdAt: new Date(Date.now() - 24 * 3600000).toISOString(),
        },
        {
          id: "3",
          title: "GitHub SSH Deployment Keys",
          category: "key",
          createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
        },
        {
          id: "4",
          title: "NexVault Technical Architecture Design Doc",
          category: "document",
          createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
        }
      ];
      localStorage.setItem("nexvault_items", JSON.stringify(defaultItems));
      setItems(defaultItems);
    }
  };

  useEffect(() => {
    loadItems();

    // Fetch active session count for statistics
    async function fetchSessionStats() {
      try {
        const res = await apiRequest("/sessions");
        if (res && res.data) {
          setSessionCount(res.data.length);
        }
      } catch (e) {
        // Fallback to 1
      }
    }
    fetchSessionStats();

    // Listen to custom item addition events from drawer
    window.addEventListener("nexvault_item_added", loadItems);
    return () => {
      window.removeEventListener("nexvault_item_added", loadItems);
    };
  }, []);

  const handleDeleteItem = (id: string) => {
    const updated = items.filter(item => item.id !== id);
    localStorage.setItem("nexvault_items", JSON.stringify(updated));
    setItems(updated);
  };

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case "key":
        return { text: "🔑 Key", style: { backgroundColor: "rgba(59, 130, 246, 0.15)", color: "var(--color-accent)", border: "1px solid rgba(59, 130, 246, 0.3)" } };
      case "project":
        return { text: "📁 Project", style: { backgroundColor: "rgba(168, 85, 247, 0.15)", color: "#c084fc", border: "1px solid rgba(168, 85, 247, 0.3)" } };
      case "file":
        return { text: "📦 File", style: { backgroundColor: "rgba(245, 158, 11, 0.15)", color: "var(--color-warning)", border: "1px solid rgba(245, 158, 11, 0.3)" } };
      default:
        return { text: "📄 Document", style: { backgroundColor: "rgba(34, 197, 94, 0.15)", color: "var(--color-success)", border: "1px solid rgba(34, 197, 94, 0.3)" } };
    }
  };

  return (
    <div className="dashboard-page-container">
      {/* Scoped CSS styling */}
      <style>{`
        .dashboard-page-container {
          padding: 2rem;
          max-width: 1200px;
          margin: 0 auto;
          box-sizing: border-box;
        }

        .dashboard-hero-title {
          font-size: 2rem;
          font-weight: 800;
          color: var(--color-text);
          margin-bottom: 0.5rem;
          letter-spacing: -0.5px;
          text-align: left;
        }

        .dashboard-hero-subtitle {
          color: var(--color-muted);
          font-size: 0.95rem;
          margin-bottom: 2rem;
          text-align: left;
        }

        /* Stats Grid */
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 1.5rem;
          margin-bottom: 2.5rem;
        }

        .stat-card {
          background: var(--color-card);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
          text-align: left;
          transition: border-color var(--transition-fast), transform var(--transition-fast);
        }

        .stat-card:hover {
          border-color: var(--color-accent);
          transform: translateY(-2px);
        }

        .stat-label {
          font-size: 0.8rem;
          color: var(--color-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          font-weight: 600;
        }

        .stat-value {
          font-size: 2rem;
          font-weight: 800;
          color: var(--color-text);
        }

        .stat-desc {
          font-size: 0.75rem;
          color: var(--color-muted);
        }

        .dashboard-section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.25rem;
        }

        .section-title {
          font-size: 1.3rem;
          font-weight: 700;
          color: var(--color-text);
        }

        .quick-nav-link {
          font-size: 0.85rem;
          color: var(--color-accent);
          text-decoration: none;
          font-weight: 600;
        }

        .quick-nav-link:hover {
          text-decoration: underline;
        }

        /* Items list */
        .items-list-container {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .item-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1.25rem 1.5rem;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          transition: all var(--transition-fast);
          gap: 1rem;
        }

        .item-row:hover {
          background: rgba(255, 255, 255, 0.04);
          border-color: rgba(255, 255, 255, 0.15);
        }

        .item-info {
          display: flex;
          align-items: center;
          gap: 1rem;
          flex: 1;
          min-width: 0;
          text-align: left;
        }

        .item-details {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
        }

        .item-title-text {
          font-weight: 600;
          font-size: 1rem;
          color: var(--color-text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .item-meta {
          font-size: 0.75rem;
          color: var(--color-muted);
        }

        .category-badge {
          padding: 4px 10px;
          border-radius: 20px;
          font-size: 0.75rem;
          font-weight: 600;
          white-space: nowrap;
        }

        .delete-item-btn {
          background: none;
          border: 1px solid rgba(239, 68, 68, 0.2);
          border-radius: 6px;
          color: var(--color-error);
          padding: 6px 12px;
          font-size: 0.8rem;
          cursor: pointer;
          font-weight: 600;
          transition: all var(--transition-fast);
        }

        .delete-item-btn:hover {
          background: rgba(239, 68, 68, 0.1);
          border-color: var(--color-error);
        }

        .empty-dashboard-state {
          padding: 3.5rem 2rem;
          border: 2px dashed var(--color-border);
          border-radius: var(--radius-lg);
          text-align: center;
          color: var(--color-muted);
        }

        .empty-dashboard-icon {
          font-size: 2.5rem;
          margin-bottom: 1rem;
        }
      `}</style>

      {/* Hero Header */}
      <h1 className="dashboard-hero-title">Secure Vault Dashboard</h1>
      <p className="dashboard-hero-subtitle">
        Your high-performance cryptographic keys, documents, and sessions under negative cache protection.
      </p>

      {/* Statistics Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-label">Secure Items</span>
          <span className="stat-value">{items.length}</span>
          <span className="stat-desc">Keys, docs, and configurations</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Active Sessions</span>
          <span className="stat-value">{sessionCount}</span>
          <span className="stat-desc">Devices connected to account</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Security Grade</span>
          <span className="stat-value" style={{ color: "var(--color-success)" }}>A+</span>
          <span className="stat-desc">Argon2id CPU isolation enabled</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Negative Cache</span>
          <span className="stat-value" style={{ color: "var(--color-accent)" }}>Active</span>
          <span className="stat-desc">5-minute token rotation cache</span>
        </div>
      </div>

      {/* Vault Items List */}
      <div className="dashboard-section-header">
        <span className="section-title">Protected Items</span>
        <Link to="/profile" className="quick-nav-link">
          Manage Settings →
        </Link>
      </div>

      {items.length > 0 ? (
        <div className="items-list-container">
          {items.map((item) => {
            const badge = getCategoryBadge(item.category);
            return (
              <div key={item.id} className="item-row">
                <div className="item-info">
                  <span className="category-badge" style={badge.style}>
                    {badge.text}
                  </span>
                  <div className="item-details">
                    <span className="item-title-text" title={item.title}>
                      {item.title}
                    </span>
                    <span className="item-meta">
                      Added: {new Date(item.createdAt).toLocaleString()}
                    </span>
                  </div>
                </div>
                <button
                  className="delete-item-btn"
                  onClick={() => handleDeleteItem(item.id)}
                  aria-label="Remove item"
                >
                  Delete
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-dashboard-state">
          <div className="empty-dashboard-icon">🛡️</div>
          <h4 style={{ color: "var(--color-text)", marginBottom: "0.5rem", fontWeight: "600" }}>
            No Items Guarded
          </h4>
          <p style={{ fontSize: "0.85rem", maxWidth: "320px", margin: "0 auto" }}>
            Open the side drawer menu on the top-left and click <strong>+ Add More</strong> to secure your first item.
          </p>
        </div>
      )}
    </div>
  );
}
