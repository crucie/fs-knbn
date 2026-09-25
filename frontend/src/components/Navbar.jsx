import { useEffect, useRef } from "react";
import Lenis from "lenis";
import gsap from "gsap";
import { useAuth } from "../context/AuthContext";
import { CalendarDays, LogOut, Terminal, UserRound } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const navRef = useRef(null);
  const brandRef = useRef(null);
  const actionsRef = useRef(null);

  useEffect(() => {
    const el = navRef.current;
    if (!el) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { y: -24, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.55, ease: "power3.out" }
      );
      if (brandRef.current) {
        gsap.fromTo(
          brandRef.current,
          { x: -12, opacity: 0 },
          { x: 0, opacity: 1, duration: 0.45, delay: 0.08, ease: "power2.out" }
        );
      }
      if (actionsRef.current) {
        gsap.fromTo(
          actionsRef.current.children,
          { y: -8, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 0.4,
            stagger: 0.06,
            delay: 0.15,
            ease: "power2.out",
          }
        );
      }
    }, el);

    return () => ctx.revert();
  }, []);

  useEffect(() => {
    const links = navRef.current?.querySelectorAll(".navbar-link");
    if (!links?.length) return;
    gsap.fromTo(
      links,
      { opacity: 0.55 },
      { opacity: 1, duration: 0.25, stagger: 0.04, ease: "power1.out" }
    );
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <nav className="navbar" ref={navRef}>
      <button
        type="button"
        className="navbar-brand-btn"
        ref={brandRef}
        onClick={() => navigate("/")}
        aria-label="Home"
      >
        <Terminal size={18} strokeWidth={2.25} />
        <span className="navbar-brand">FS-KNBN</span>
      </button>

      {user && (
        <div className="navbar-links">
          <button
            type="button"
            className={`navbar-link ${location.pathname === "/" ? "active" : ""}`}
            onClick={() => navigate("/")}
            aria-label="Boards"
            title="Boards"
          >
            Boards
          </button>
          <button
            type="button"
            className={`navbar-link ${location.pathname.startsWith("/calendar") ? "active" : ""}`}
            onClick={() => navigate("/calendar")}
            aria-label="Calendar"
            title="Calendar"
          >
            <CalendarDays size={15} />
          </button>
        </div>
      )}

      <div style={{ flex: 1 }} />

      {user && (
        <div className="navbar-actions" ref={actionsRef}>
          <button
            type="button"
            className="navbar-profile"
            onClick={() => navigate("/profile")}
            title="Profile"
            aria-label="Profile"
          >
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="navbar-avatar" referrerPolicy="no-referrer" />
            ) : (
              <span className="navbar-avatar-fallback">
                <UserRound size={14} />
              </span>
            )}
            <span className="navbar-username">@{user.username}</span>
          </button>
          <button
            id="nav-logout"
            className="btn btn-sm btn-icon"
            onClick={handleLogout}
            title="Logout"
            aria-label="Logout"
          >
            <LogOut size={15} />
          </button>
        </div>
      )}
    </nav>
  );
}

/** App-wide Lenis smooth scroll — skips nested scroll regions. */
export function SmoothScroll() {
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.05,
      smoothWheel: true,
      touchMultiplier: 1.4,
      prevent: (node) =>
        Boolean(
          node?.closest?.(
            "[data-lenis-prevent], .due-wheel-list, .meet-slot-list, .team-chat-messages, .team-rail"
          )
        ),
    });

    let rafId = 0;
    const raf = (time) => {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    };
    rafId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
    };
  }, []);

  return null;
}
