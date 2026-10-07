import { defineConfig } from 'vite';
// base './' lets the built app run from any folder or GitHub Pages path; host:true exposes the dev server to your phone on the same Wi-Fi.
export default defineConfig({ base: './', server: { host: true } });
