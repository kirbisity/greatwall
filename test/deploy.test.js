import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/** The top-level files and folders the Pages workflow copies into the site. */
function published() {
  const copy = read('.github/workflows/pages.yml').match(/cp -R ([^\n]+?) _site\//);
  assert.ok(copy, 'the workflow should assemble the site with a single cp -R');
  return new Set(copy[1].trim().split(/\s+/));
}

/** Every file a page or the manifest asks the browser for, on this site. */
function referenced() {
  const local = (url) => !/^(https?:|data:|#|mailto:|javascript:)/.test(url) && !url.startsWith('//');
  const found = new Set();
  for (const page of ['index.html', 'greatwall.html']) {
    for (const [, url] of read(page).matchAll(/(?:href|src)="([^"]+)"/g)) {
      if (local(url)) {
        found.add(url.split(/[?#]/)[0]);
      }
    }
  }
  for (const [, url] of read('greatwall.css').matchAll(/url\(['"]?([^'")]+)['"]?\)/g)) {
    if (local(url)) {
      found.add(url);
    }
  }
  const manifest = JSON.parse(read('manifest.webmanifest'));
  found.add(manifest.start_url);
  for (const icon of manifest.icons) {
    found.add(icon.src);
  }
  return found;
}

test('everything the site asks for exists and is published', () => {
  const copied = published();
  const missing = [];
  const unpublished = [];
  for (const path of referenced()) {
    if (path.startsWith('../')) {
      missing.push(`${path} (points outside the site)`);
      continue;
    }
    if (!existsSync(new URL(`../${path}`, import.meta.url))) {
      missing.push(path);
    }
    if (!copied.has(path.split('/')[0])) {
      unpublished.push(path);
    }
  }
  assert.deepEqual(missing, [], 'every file the site references should be in the repo');
  assert.deepEqual(unpublished, [], 'and the deploy should copy it, or it 404s on the live site');
});

test('the site does not publish its own tests or tooling', () => {
  const copied = published();
  for (const internal of ['test', 'node_modules', '.github', 'package.json']) {
    assert.ok(!copied.has(internal), `${internal} should not be on the live site`);
  }
});

test('the home-screen manifest describes an installable game', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.start_url, 'greatwall.html');
  assert.ok(['fullscreen', 'standalone'].includes(manifest.display), 'a launch should drop the browser bars');
  const sizes = manifest.icons.map((icon) => icon.sizes);
  assert.ok(sizes.includes('192x192') && sizes.includes('512x512'), 'Android wants 192 and 512 icons');
  assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable'), 'and one it may crop to its own shape');
  assert.match(read('greatwall.html'), /rel="apple-touch-icon" href="images\/icon-180\.png"/,
    'iOS takes its home-screen icon from the page, not the manifest');
});
