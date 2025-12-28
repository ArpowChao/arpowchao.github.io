/**
 * Antigravity Master Router (High Reliability)
 * Dynamically switches background engines and prevents flashing/duplicates.
 */
(function() {
    if (window._antigravity_active) return; // Prevent duplicate instantiation
    window._antigravity_active = true;

    console.log('[Antigravity] System Initialized.');

    // 1. Singleton Canvas Creation
    let canvas = document.getElementById('antigravity-canvas');
    if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.id = 'antigravity-canvas';
        document.body.appendChild(canvas);
    }

    function switchEngine() {
        const htmlId = document.documentElement.id;
        const mode = document.documentElement.getAttribute('data-mode') || 
                     (document.body.classList.contains('light-theme') ? 'light' : 'dark');
        
        // Stop current animation loop
        window._antigravity_stop_signal = Date.now();
        
        let engine = 'mist'; // Default to Mist (No lines)
        if (htmlId === 'theme-prism') engine = 'prism';
        else if (htmlId === 'theme-nature' || htmlId === 'theme-lavender') engine = 'wave';
        else if (mode === 'light') engine = 'wave';

        const scriptTag = document.querySelector('script[src*="antigravity-bg.js"]');
        if (!scriptTag) return;
        const root = scriptTag.src.replace('antigravity-bg.js', '');
        const engineUrl = root + 'bg-' + engine + '.js';

        console.log(`[Antigravity] 🚀 Activating Engine: ${engine} (Theme: ${htmlId}, Mode: ${mode})`);

        // Remove previous engine scripts
        document.querySelectorAll('.antigravity-engine').forEach(s => s.remove());

        const script = document.createElement('script');
        script.src = engineUrl;
        script.className = 'antigravity-engine';
        script.async = true;
        document.head.appendChild(script);
        
        window._antigravity_current = engine;
    }

    // Initial Load
    switchEngine();

    // Theme Change Observer
    const observer = new MutationObserver((mutations) => {
        let changed = false;
        mutations.forEach(m => {
            if (m.attributeName === 'data-mode' || m.attributeName === 'id') changed = true;
        });
        if (changed) {
            const htmlId = document.documentElement.id;
            const mode = document.documentElement.getAttribute('data-mode') || 'dark';
            
            let next = 'mist';
            if (htmlId === 'theme-prism') next = 'prism';
            else if (htmlId === 'theme-nature' || htmlId === 'theme-lavender') next = 'wave';
            else if (mode === 'light') next = 'wave';
            
            if (next !== window._antigravity_current) {
                switchEngine();
            }
        }
    });
    observer.observe(document.documentElement, { attributes: true });
})();
