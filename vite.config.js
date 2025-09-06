import { defineConfig } from "vite";
import simpleHtmlPlugin from "vite-plugin-simple-html";

export default defineConfig({
    // config options
    base: "/",
    plugins: [
        simpleHtmlPlugin({
            minify: true, // Enable minification
            // You can also pass specific options to @swc/html here for customization
            // minify: {
            //   minifyJs: true,
            //   removeComments: true,
            // },
        }),
    ],
});
