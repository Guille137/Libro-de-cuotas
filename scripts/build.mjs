import { cp, mkdir } from 'node:fs/promises';
import { build } from 'esbuild';

// Publicar únicamente los archivos de la aplicación, nunca el repositorio completo.
await mkdir('dist', { recursive: true });
for (const path of ['index.html', 'styles', 'src']) {
  await cp(path, `dist/${path}`, { recursive: true });
}
await build({ entryPoints: ['src/main.js'], outfile: 'dist/src/main.js', bundle: true, format: 'esm', target: 'es2022', minify: true, sourcemap: false });
console.log('Aplicación lista en dist/.');
