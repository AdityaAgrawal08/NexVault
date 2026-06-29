import { useNavigate, Navigate } from "react-router-dom";

interface UserSession {
  id: string;
  username: string;
  email: string;
  phoneNumber: string;
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const userJson = localStorage.getItem("user");

  if (!userJson) {
    return <Navigate to="/login" replace />;
  }

  let user: UserSession;
  try {
    user = JSON.parse(userJson);
  } catch (err) {
    localStorage.removeItem("user");
    return <Navigate to="/login" replace />;
  }

  function handleLogout() {
    localStorage.removeItem("user");
    navigate("/login");
  }

  return (
    <div className="page-center">
      <div className="card profile-card">
        <div className="profile-header">
          <div className="profile-avatar">
            {user.username.substring(0, 2).toUpperCase()}
          </div>
          <h1 className="profile-title">Welcome, {user.username}!</h1>
          <p className="profile-subtitle">Your secure profile details</p>
        </div>

        <div className="profile-details">
          <div className="profile-field">
            <span className="profile-field-label">Username</span>
            <span className="profile-field-value">{user.username}</span>
          </div>

          <div className="profile-field">
            <span className="profile-field-label">Email Address</span>
            <span className="profile-field-value">{user.email}</span>
          </div>

          <div className="profile-field">
            <span className="profile-field-label">Phone Number</span>
            <span className="profile-field-value">{user.phoneNumber}</span>
          </div>
        </div>

        <button onClick={handleLogout} className="logout-btn">
          Log out
        </button>
      </div>
    </div>
  );
}
