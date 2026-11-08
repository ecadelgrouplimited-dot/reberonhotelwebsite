/** Shared by the server layout and the client applier (not a client module). */
export const TYPO_CACHE = 'rb-typography';

/** Runs before paint: the last-known fonts, so pages never flash the defaults. */
export const typographyBootScript = `try{var v=JSON.parse(localStorage.getItem('${TYPO_CACHE}')||'null');if(v)for(var k in v)document.documentElement.style.setProperty(k,v[k])}catch(e){}`;
