(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.SecureRoster = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function (root) {
    'use strict';

    const payload = Object.freeze({
        salt: 'RDDPc3fNmNBxPqT/Xi1A7Q==',
        iv: 'C+Flgy58EXQieBlH',
        ciphertext: 'Amu6wte/UM0joO4xCvULRrydnO0PdVClCzv/YteBHMVixo8EScjuo9Gr/3rHkZL+jUVvdP4QBdoSPlg2npo0rLAIWFaV8CDLMS2J3UImf19wVKWalcH9As7b2T1vt5sHhB0GH8pLcSpxHrxGLusg7z1O3iQkljL/jv+kPPee8B037ve/4EwbixPGIcz45bvyz6nOyGzqDxZ9PvVg+ToNshSt4Pokg33Deyz2XyPXti+W/2MBKknJLU8ndhHEjOmK9Z6I3j2+vrmnjH+6BFBmH28nCAzmkdy0IS07L7vUZO6SOeTrNnpNDG7EUcOHGzHW+j5R+ar5Jqnc5HudHVI+rsBquMOeyLzbBpV7i7tzsdlceVkxUQP5tRst3LnTH5rCpN1Iz/4hKm/KGEdMygBxsoyd+uZIHCG1AlJKb5NiRHN2jg6fysrJFmS6AUS/+r/1tQ7hQiNoMczJnKJSR3CqVf+Z/nPfsSxLCKM0RyMkyAe/nK5nncRc5DWDUbKbFrAKyuOZk56GxyBhRKgHxO0KDYin0GImt/CMdgn3/wgVCpd1VpmFTh2jG5wxhAojd7fF5Osc7p0LTaTUb6fRyPVOmS/sGCRKL5Y9qcEhtm1ST0b8tV2umrZmaErlt5InADNWxXEsHsVreL94z8WPCGo+oBIeccA8zgxmo76biRGporc='
    });
    const iterations = 600000;

    const decodeBase64 = (value) => {
        const binary = root.atob(value);
        return Uint8Array.from(binary, (character) => character.charCodeAt(0));
    };

    const decrypt = async (password) => {
        const subtle = root.crypto && root.crypto.subtle;
        if (!subtle || typeof root.TextEncoder !== 'function' || typeof root.TextDecoder !== 'function') {
            throw new Error('WEB_CRYPTO_UNAVAILABLE');
        }

        try {
            const encoder = new root.TextEncoder();
            const keyMaterial = await subtle.importKey(
                'raw',
                encoder.encode(String(password)),
                'PBKDF2',
                false,
                ['deriveKey']
            );
            const key = await subtle.deriveKey(
                {
                    name: 'PBKDF2',
                    salt: decodeBase64(payload.salt),
                    iterations,
                    hash: 'SHA-256'
                },
                keyMaterial,
                { name: 'AES-GCM', length: 256 },
                false,
                ['decrypt']
            );
            const plaintext = await subtle.decrypt(
                { name: 'AES-GCM', iv: decodeBase64(payload.iv) },
                key,
                decodeBase64(payload.ciphertext)
            );
            const names = JSON.parse(new root.TextDecoder().decode(plaintext));

            if (!Array.isArray(names) || !names.every((name) => typeof name === 'string' && name.trim())) {
                throw new Error('INVALID_ROSTER_DATA');
            }
            return names;
        } catch (error) {
            if (error && (error.message === 'WEB_CRYPTO_UNAVAILABLE' || error.message === 'INVALID_ROSTER_DATA')) {
                throw error;
            }
            throw new Error('INVALID_ROSTER_PASSWORD');
        }
    };

    return Object.freeze({ decrypt });
});
