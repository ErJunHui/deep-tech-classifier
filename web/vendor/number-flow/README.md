# NumberFlow (vendored)

`number-flow.js` is [NumberFlow](https://number-flow.barvian.me/vanilla) 0.6.2
(npm package `number-flow`, MIT, see `LICENSE`), bundled into one
self-contained ES module. Importing it defines the `<number-flow>` custom
element. The workbench uses it for the animated counters in the run header and
the summary strip (`web/js/render/counter.js`) and imports it from `main.js`
with a dynamic `import()`, so a missing or broken file only loses the
animation.

Nothing from `node_modules` is committed. The file was built once, outside the
repository, with Node 22 and npm 11:

```
mkdir numberflow-build && cd numberflow-build
npm init -y
npm install --save-exact number-flow@0.6.2 esbuild
npx esbuild node_modules/number-flow/dist/index.mjs --bundle --format=esm --minify --outfile=out/number-flow.js
```

(esbuild 0.28.2; `dist/index.mjs` is the package's `exports["."].import`.)
Then `out/number-flow.js` was copied here, `node_modules/number-flow/LICENSE.md`
was copied to `LICENSE`, and the version was written to `VERSION`.

To upgrade, repeat the steps with the new version (the latest release that is
at least two weeks old), check the element API in the package's `dist/index.d.ts`
and `dist/lite.d.ts` against `counter.js`, and update `VERSION` and this file.
