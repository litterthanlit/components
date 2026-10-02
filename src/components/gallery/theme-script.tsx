/**
 * Runs before paint to set data-theme and avoid a flash of the wrong theme.
 * Priority: ?theme= in the URL (used by capture frames, never persisted) →
 * saved choice → light (litt.design is light-first).
 */
const script = `(function(){try{var d=document.documentElement;var q=new URLSearchParams(location.search).get('theme');var s=localStorage.getItem('theme');var t=(q==='light'||q==='dark')?q:(s==='light'||s==='dark')?s:'light';d.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='light';}})();`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
