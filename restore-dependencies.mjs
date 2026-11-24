import { mkdir, writeFile } from 'node:fs/promises';
const base = new URL('./', import.meta.url);
const files = {
  'three.min.js': 'build/three.min.js',
  'RoundedBoxGeometry.js': 'examples/js/geometries/RoundedBoxGeometry.js',
  'RoomEnvironment.js': 'examples/js/environments/RoomEnvironment.js',
  'GLTFLoader.js': 'examples/js/loaders/GLTFLoader.js',
  'LICENSE': 'LICENSE'
};
await mkdir(new URL('vendor/', base), { recursive: true });
for (const [name, path] of Object.entries(files)) {
  let data;
  for (const origin of ['https://cdn.jsdelivr.net/npm/three@0.147.0/', 'https://unpkg.com/three@0.147.0/']) {
    try {
      const response = await fetch(origin + path, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      data = Buffer.from(await response.arrayBuffer());
      break;
    } catch (error) { console.warn(`${name}: ${error.message}`); }
  }
  if (!data) throw new Error(`无法下载 ${name}，请检查网络后重新运行。`);
  await writeFile(new URL('vendor/' + name, base), data);
  console.log(`已恢复 vendor/${name}`);
}
console.log('依赖恢复完成。运行 node serve.mjs 启动项目。');
