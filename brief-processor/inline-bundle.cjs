const fs   = require('fs');
const path = require('path');
const dist  = 'dist';
const html  = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');

const cssMatch = html.match(/href=\/(brief-processor\.[a-f0-9]+\.css)/);
const jsMatch  = html.match(/src=\/(brief-processor\.[a-f0-9]+\.js)/);

if (!cssMatch || !jsMatch) {
  console.error('Could not find CSS/JS refs in dist/index.html');
  console.error(html);
  process.exit(1);
}

const css = fs.readFileSync(path.join(dist, cssMatch[1]), 'utf8');
const js  = fs.readFileSync(path.join(dist, jsMatch[1]),  'utf8');

// Escape </script> inside inlined JS to prevent premature tag closing
const safeJs = js.replace(/<\/script>/gi, '<\\/script>');

// IMPORTANT: Use a replacement function (not a string) to avoid $& $' etc. special patterns
// in minified JS corrupting the String.replace output.
let out = html;
out = out.replace(/<link rel=stylesheet href=\/[^>]+>/, () => '<style>' + css + '</style>');
out = out.replace(/<script type=module src=\/[^>]+><\/script>/, () => '<script type="module">' + safeJs + '</script>');

fs.writeFileSync('bundle.html', out);
console.log('bundle.html written, size:', fs.statSync('bundle.html').size, 'bytes');
