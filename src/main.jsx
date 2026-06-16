import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { PageContent, pageRoutes } from "./pages";
import { AuthProvider, LoginPage, ResetPasswordPage, useAuth } from "./auth";
import { AdminPage } from "./admin";
import { AccountPage } from "./portal";
import "./styles.css";

const navGroups = [
  {
    title: "Our School",
    links: [
      ["学校简介 About Us", "/about"],
      ["管理团队 Management Team", "/administration"],
      ["学校制度 Regulation", "/regulation"],
      ["新闻快讯 Newsletter", "/newsletters"],
    ],
  },
  {
    title: "Academics",
    links: [
      ["教学大纲 Catalog", "/catalog"],
      ["课程注册 Registration", "/registration"],
      ["学校校历 School Calendar", "/calendar"],
      ["课程安排 Courses", "/courses"],
    ],
  },
  {
    title: "More About",
    links: [
      ["联系我们 Contact Us", "/contact"],
      ["交通指南 Location", "/location"],
      ["公益服务 Community Services", "/community-services"],
      ["友情赞助 Proud Sponsors", "/sponsors"],
      ["中文资讯 Chinese Resources", "/resources"],
      ["社区链接 Links", "/links"],
      ["意见反馈 Feedback", "/feedback"],
    ],
  },
];

const slides = Array.from(
  { length: 10 },
  (_, index) => `https://ctsccs.org/images/img_${index + 1}.png`,
);

function useRouter() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const handlePopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = (nextPath) => {
    if (nextPath === path) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    window.history.pushState({}, "", nextPath);
    setPath(nextPath);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return { path, navigate };
}

function SiteLink({ to, children, className, onClick }) {
  const { navigate } = React.useContext(RouterContext);
  return (
    <a
      className={className}
      href={to}
      onClick={(event) => {
        event.preventDefault();
        navigate(to);
        onClick?.();
      }}
    >
      {children}
    </a>
  );
}

const RouterContext = React.createContext({ navigate: () => {} });

function Header({ menuOpen, setMenuOpen }) {
  const { session } = useAuth();
  return (
    <header className="site-header">
      <div className="header-inner">
        <SiteLink className="brand" to="/" aria-label="SCCS 首页">
          <span className="brand-emblem" aria-hidden="true">
            <img src="/sccs-blue-mark.png" alt="" />
          </span>
          <span className="brand-name">
            <strong>东南康州中文学校</strong>
            <small>Southeastern Connecticut Chinese School</small>
          </span>
        </SiteLink>

        <div className="header-actions">
          <SiteLink
            className="portal-link"
            to={session ? "/account" : "/login"}
          >
            <span className="portal-icon" aria-hidden="true">人</span>
            {session ? "My SCCS Portal" : "My SCCS"}
          </SiteLink>
          <button
            className="menu-button"
            type="button"
            aria-expanded={menuOpen}
            aria-controls="site-navigation"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span />
            <span />
            <span />
            <span className="sr-only">打开菜单</span>
          </button>
        </div>
      </div>
    </header>
  );
}

function Navigation({ menuOpen, closeMenu, currentPath }) {
  return (
    <aside id="site-navigation" className={`sidebar ${menuOpen ? "is-open" : ""}`}>
      <nav aria-label="主要导航">
        {navGroups.map((group) => (
          <section className="nav-group" key={group.title}>
            <h2>{group.title}</h2>
            <ul>
              {group.links.map(([label, href]) => (
                <li key={href}>
                  <SiteLink
                    to={href}
                    className={`nav-link ${currentPath === href ? "is-active" : ""}`}
                    onClick={closeMenu}
                  >
                    <span>{label}</span>
                    <span aria-hidden="true">›</span>
                  </SiteLink>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </nav>

      <a
        className="facebook-link"
        href="https://www.facebook.com/ctsccs.chinese.3"
        target="_blank"
        rel="noreferrer"
      >
        <span aria-hidden="true">f</span>
        Follow us on Facebook
      </a>
    </aside>
  );
}

function Slideshow() {
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % slides.length);
    }, 5000);
    return () => window.clearInterval(timer);
  }, []);

  const move = (direction) => {
    setActiveSlide((current) => (current + direction + slides.length) % slides.length);
  };

  return (
    <section className="hero" aria-label="校园照片轮播">
      {slides.map((slide, index) => (
        <img
          className={index === activeSlide ? "is-active" : ""}
          src={slide}
          alt={`SCCS 校园活动照片 ${index + 1}`}
          key={slide}
        />
      ))}
      <div className="hero-shade" />
      <div className="hero-copy">
        <p>Welcome to SCCS</p>
        <h1>在语言里认识文化<br />在社区中一起成长</h1>
        <SiteLink className="hero-button" to="/registration">
          课程注册 <span aria-hidden="true">→</span>
        </SiteLink>
      </div>
      <button className="slide-arrow previous" onClick={() => move(-1)} aria-label="上一张">‹</button>
      <button className="slide-arrow next" onClick={() => move(1)} aria-label="下一张">›</button>
      <div className="slide-dots">
        {slides.map((slide, index) => (
          <button
            className={index === activeSlide ? "is-active" : ""}
            onClick={() => setActiveSlide(index)}
            aria-label={`显示第 ${index + 1} 张照片`}
            key={slide}
          />
        ))}
      </div>
    </section>
  );
}

function Announcements() {
  return (
    <div className="content-grid">
      <section className="card announcements">
        <div className="section-heading">
          <span className="eyebrow">Latest News</span>
          <h2>标题新闻</h2>
        </div>
        <article>
          <div className="date-badge"><strong>07</strong><span>SEP</span></div>
          <div>
            <h3>关于 2025–2026 学年通知</h3>
            <ul>
              <li>中文学校新学期将于 2025 年 9 月 7 日开始，第一节课上课时间为上午 9:30。</li>
              <li>2025 秋季所有课程将在 <strong>Waterford High School</strong> 进行，恢复课堂现场教学。</li>
              <li>LCG 将 SAT、PSAT 合并为一节 90 分钟课程，收费调整为 $500。</li>
              <li>Norwich 家庭可选择现场注册，也可以 <SiteLink to="/registration">在线注册课程</SiteLink>。</li>
            </ul>
          </div>
        </article>
      </section>

      <section className="card principal">
        <div className="section-heading">
          <span className="eyebrow">From Our Principal</span>
          <h2>校长纸上谈兵</h2>
        </div>
        <blockquote>
          “我们不仅仅是为了教会学生讲中文和理解中国文化而办学，我们要参与培养一批批真正掌握双语和多元文化的学生。”
        </blockquote>
        <p>我们不断摸索并结合中美两国教学方法，培养既有扎实基础知识，又富有创新能力，愿意贡献并勇于负责的人才。</p>
        <SiteLink className="text-link" to="/about">
          了解学校 <span aria-hidden="true">→</span>
        </SiteLink>
      </section>
    </div>
  );
}

function QuickLinks() {
  const items = [
    ["课程注册", "Registration", "/registration"],
    ["学校校历", "Calendar", "/calendar"],
    ["课程安排", "Courses", "/courses"],
  ];

  return (
    <section className="quick-links" aria-label="常用链接">
      {items.map(([chinese, english, href], index) => (
        <SiteLink to={href} key={href}>
          <span className="quick-number">0{index + 1}</span>
          <span><strong>{chinese}</strong><small>{english}</small></span>
          <span className="quick-arrow" aria-hidden="true">↗</span>
        </SiteLink>
      ))}
    </section>
  );
}

function HomePage() {
  return (
    <>
      <Slideshow />
      <QuickLinks />
      <Announcements />
    </>
  );
}

function Footer() {
  return (
    <footer>
      <div className="footer-inner">
        <div>
          <strong>SCCS</strong>
          <p>Southeastern Connecticut Chinese School</p>
        </div>
        <div className="footer-links">
          <SiteLink to="/about">About Us</SiteLink>
          <SiteLink to="/contact">Contact</SiteLink>
          <SiteLink to="/location">Location</SiteLink>
          <SiteLink to="/newsletters">Newsletter</SiteLink>
        </div>
        <p className="copyright">© 2025–2026 SCCS · East Lyme, Connecticut, USA</p>
      </div>
    </footer>
  );
}

function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { path, navigate } = useRouter();
  const normalizedPath = path.length > 1 ? path.replace(/\/$/, "") : path;
  const isAdminPath = normalizedPath === "/admin";
  const authRoutes = ["/login", "/account", "/admin", "/reset-password"];
  const isKnownPage = normalizedPath === "/" || pageRoutes.includes(normalizedPath) || authRoutes.includes(normalizedPath);

  useEffect(() => {
    document.title = normalizedPath === "/"
      ? "SCCS | 东南康州中文学校"
      : "SCCS | Southeastern Connecticut Chinese School";
  }, [normalizedPath]);

  return (
    <RouterContext.Provider value={{ navigate }}>
      <div id="top">
        <Header menuOpen={menuOpen} setMenuOpen={setMenuOpen} />
        <div className={`page-shell ${isAdminPath ? "admin-shell" : ""}`}>
          {!isAdminPath && (
            <Navigation
              menuOpen={menuOpen}
              closeMenu={() => setMenuOpen(false)}
              currentPath={normalizedPath}
            />
          )}
          <main>
            {normalizedPath === "/" && <HomePage />}
            {pageRoutes.includes(normalizedPath) && <PageContent path={normalizedPath} Link={SiteLink} />}
            {normalizedPath === "/login" && <LoginPage Link={SiteLink} />}
            {normalizedPath === "/reset-password" && <ResetPasswordPage Link={SiteLink} />}
            {normalizedPath === "/account" && <AccountPage Link={SiteLink} />}
            {normalizedPath === "/admin" && <AdminPage Link={SiteLink} />}
            {!isKnownPage && (
              <div className="inner-page">
                <div className="page-title"><span>404</span><h1>页面未找到</h1></div>
                <section className="page-section">
                  <p>你访问的页面不存在。</p>
                  <SiteLink className="button-link" to="/">返回首页</SiteLink>
                </section>
              </div>
            )}
          </main>
        </div>
        <Footer />
        {menuOpen && !isAdminPath && (
          <button
            className="menu-backdrop"
            aria-label="关闭菜单"
            onClick={() => setMenuOpen(false)}
          />
        )}
      </div>
    </RouterContext.Provider>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>,
);
