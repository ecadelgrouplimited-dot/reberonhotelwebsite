/**
 * Runs before paint, outside React: applies the saved theme and accessibility choices, and opts browsers
 * without scroll-driven animations into the observer fallback (RevealFallback).
 * It never touches element attributes, so hydration stays clean.
 */
const code = `(function(){try{var d=document.documentElement;var t=localStorage.getItem('rb-theme');if(t==='light'||t==='dark')d.setAttribute('data-theme',t);d.classList.add('js');
try{var a=JSON.parse(localStorage.getItem('rb-a11y')||'{}');if(a.text&&a.text!==100)d.setAttribute('data-a11y-text',String(a.text));['spacing','font','contrast','gray','links','motion','cursor','focus','noimg','guide'].forEach(function(k){if(a[k])d.setAttribute('data-a11y-'+k,'')});}catch(e){}
if(!d.hasAttribute('data-a11y-motion')&&!(window.CSS&&CSS.supports('animation-timeline: view()'))&&!matchMedia('(prefers-reduced-motion: reduce)').matches&&'IntersectionObserver' in window)d.classList.add('reveal-io');
}catch(e){}})();`;

export function BootScript() {
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
