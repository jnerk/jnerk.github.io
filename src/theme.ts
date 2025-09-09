import { THEME_KEY } from "./config";

export function getSystemTheme(): "dark" | "light" {
    return matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
}

export function getCurrentTheme(): string {
    return (
        document.documentElement.getAttribute("data-theme") || getSystemTheme()
    );
}

export function applyTheme(theme: string): void {
    document.documentElement.setAttribute("data-theme", theme);
}

export function updateToggleUI(btn: HTMLElement, theme: string): void {
    if (!btn) return;
    const to = theme === "dark" ? "light" : "dark";
    btn.textContent = to === "light" ? "☀" : "☾";
    btn.setAttribute("aria-label", `Switch to ${to} mode`);
    btn.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
}

export function initThemeToggle(): void {
    const btn = document.getElementById("theme-toggle");
    if (!btn) return;

    // Initial UI based on current theme (set early in index.html)
    updateToggleUI(btn, getCurrentTheme());

    btn.addEventListener("click", () => {
        const current = getCurrentTheme();
        const next = current === "dark" ? "light" : "dark";
        applyTheme(next);
        localStorage.setItem(THEME_KEY, next);
        updateToggleUI(btn, next);
    });

    // If user hasn't chosen manually, follow OS changes
    const mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", (e) => {
        if (localStorage.getItem(THEME_KEY)) return; // manual override present
        const next = e.matches ? "dark" : "light";
        applyTheme(next);
        updateToggleUI(btn, next);
    });
}
