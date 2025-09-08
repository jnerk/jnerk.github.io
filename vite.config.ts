import { defineConfig } from "vite";
import simpleHtmlPlugin from "vite-plugin-simple-html";

export default defineConfig({
    // config options
    base: "/",
    plugins: [
        simpleHtmlPlugin({
            minify: true, // Enable minification
        }),
    ],
});
