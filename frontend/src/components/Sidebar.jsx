
import "./Sidebar.css";
const menuItems = [
  { icon: "⌂", label: "Dashboard" },
  { icon: "▧", label: "Scan Image" },
  { icon: "↗", label: "Scan Link" },
  { icon: "✉", label: "Scan Message" },
  { icon: "◷", label: "History" },
  { icon: "⚙", label: "Settings" },
];

function Sidebar({ activePage = "Dashboard", onNavigate, signedIn = true }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-icon">🛡️</div>
        <div>
          <h2>ScamShield</h2>
          <span>AI PROTECTION</span>
        </div>
      </div>

      <p className="menu-heading">MAIN MENU</p>

      <nav className="sidebar-menu">
        {menuItems.map((item) => (
          <button
            key={item.label}
            className={`menu-item ${
              activePage === item.label ? "active" : ""
            }`}
            onClick={() => onNavigate?.(item.label)}
          >
            <span className="menu-icon">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <div className="protection-card">
          <span>🛡️</span>
          <h3>Stay Protected!</h3>
          <p>Stay alert and scan suspicious content before interacting.</p>
        </div>

        <div className="sidebar-footer">
          <span>●</span>{" "}
          {signedIn ? "Your protection is active" : "Guest mode · Sign in to save scans"}
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;
