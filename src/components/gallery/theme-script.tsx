/**
 * Runs before paint to set data-theme and avoid a flash of the wrong theme.
 * Priority: ?theme= in the URL (used by capture frames, never persisted) →
 * saved choice → cs (the Counter-Strike 1.6 theme is the default).
 * The storage key is versioned so choices saved before cs existed don't
 * hide it; bump it again if the default changes.
 */
export const THEME_KEY = "theme:v2";

const script = `(function(){var d=document.documentElement;var ok=function(t){return t==='light'||t==='dark'||t==='cs'};try{var q=new URLSearchParams(location.search).get('theme');var s=localStorage.getItem('${THEME_KEY}');d.dataset.theme=ok(q)?q:ok(s)?s:'cs';}catch(e){d.dataset.theme='cs';}})();`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
