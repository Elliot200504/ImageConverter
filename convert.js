#!/usr/bin/env node

// Command line version. Give it files or a folder and it converts everything.
//   node convert.js photo.png --to jpeg

const fs = require('fs');
const path = require('path');
const { FORMATS, INPUT_EXT, resolveFormat, convert } = require('./converter');

function usage() {
  console.log([
    'Image converter',
    '',
    '  convert <input...> --to <format> [options]',
    '',
    'Inputs are files or folders (folders get scanned for images).',
    '',
    'Options',
    '  -t, --to <format>     png | jpeg | webp | avif | tiff | gif   (required)',
    '  -o, --out <dir>       output folder (default: next to each input)',
    '  -q, --quality <1-100> quality for lossy formats, default 80',
    '  -w, --width <px>      resize width',
    '  -h, --height <px>     resize height',
    '      --fit <mode>      cover | contain | fill | inside | outside (default inside)',
    '      --recursive       also look in subfolders',
    '      --flatten <color> put transparent pixels on a background, like "#ffffff"',
    '      --no-animation    only keep the first frame of animated files',
    '      --overwrite       overwrite files that already exist',
    '      --help            show this text',
    '',
    'Examples',
    '  convert photo.png --to jpeg',
    '  convert ./pictures --to webp -q 90 -o ./converted',
    '  convert clip.webp --to gif -w 480',
    '',
    'If you would rather click on things, run "npm start" and use the browser.',
  ].join('\n'));
}

const TAKES_VALUE = ['-t', '--to', '-o', '--out', '-q', '--quality',
  '-w', '--width', '-h', '--height', '--fit', '--flatten'];

function parseArgs(argv) {
  const opts = {
    inputs: [],
    to: null,
    out: null,
    quality: 80,
    width: null,
    height: null,
    fit: 'inside',
    recursive: false,
    flatten: null,
    animation: true,
    overwrite: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = argv[i + 1];

    if (TAKES_VALUE.includes(arg)) {
      if (value === undefined) throw new Error('Missing value for ' + arg);
      i++;
    }

    if (arg === '--help' || arg === '-?') {
      usage();
      process.exit(0);
    } else if (arg === '-t' || arg === '--to') {
      opts.to = value;
    } else if (arg === '-o' || arg === '--out') {
      opts.out = value;
    } else if (arg === '-q' || arg === '--quality') {
      opts.quality = Number(value);
    } else if (arg === '-w' || arg === '--width') {
      opts.width = Number(value);
    } else if (arg === '-h' || arg === '--height') {
      opts.height = Number(value);
    } else if (arg === '--fit') {
      opts.fit = value;
    } else if (arg === '--flatten') {
      opts.flatten = value;
    } else if (arg === '--recursive') {
      opts.recursive = true;
    } else if (arg === '--no-animation') {
      opts.animation = false;
    } else if (arg === '--overwrite') {
      opts.overwrite = true;
    } else if (arg.startsWith('-')) {
      throw new Error('Unknown option: ' + arg);
    } else {
      opts.inputs.push(arg);
    }
  }

  return opts;
}

function collectFiles(input, recursive) {
  if (fs.statSync(input).isFile()) {
    return [input];
  }

  const files = [];
  const entries = fs.readdirSync(input, { withFileTypes: true });

  for (const entry of entries) {
    const full = path.join(input, entry.name);

    if (entry.isDirectory()) {
      if (recursive) {
        files.push(...collectFiles(full, true));
      }
    } else if (INPUT_EXT.has(path.extname(entry.name).toLowerCase())) {
      files.push(full);
    }
  }

  return files;
}

function humanSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

async function convertFile(file, opts, format) {
  const outDir = opts.out || path.dirname(file);
  const name = path.basename(file, path.extname(file));
  const outFile = path.join(outDir, name + FORMATS[format].ext);

  if (path.resolve(outFile) === path.resolve(file)) {
    throw new Error('input and output are the same file');
  }
  if (!opts.overwrite && fs.existsSync(outFile)) {
    throw new Error('output exists (use --overwrite)');
  }

  const before = fs.statSync(file).size;
  const result = await convert(file, opts);

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, result.data);

  return { outFile: outFile, before: before, after: result.size };
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error('Error: ' + err.message + '\n');
    usage();
    process.exit(1);
  }

  if (opts.inputs.length === 0 && !opts.to) {
    usage();
    process.exit(0);
  }
  if (opts.inputs.length === 0 || !opts.to) {
    console.error('Error: need at least one input and a --to format.\n');
    usage();
    process.exit(1);
  }

  const format = resolveFormat(opts.to);
  if (!format) {
    console.error('Error: unknown target format "' + opts.to + '". Pick one of: ' + Object.keys(FORMATS).join(', '));
    process.exit(1);
  }
  if (!Number.isFinite(opts.quality) || opts.quality < 1 || opts.quality > 100) {
    console.error('Error: --quality must be a number between 1 and 100');
    process.exit(1);
  }

  const files = [];
  for (const input of opts.inputs) {
    if (!fs.existsSync(input)) {
      console.error('Error: no such file or folder: ' + input);
      process.exit(1);
    }
    files.push(...collectFiles(input, opts.recursive));
  }

  if (files.length === 0) {
    console.error('No images found.');
    process.exit(1);
  }

  console.log('Converting ' + files.length + ' file(s) to ' + format + '\n');

  let ok = 0;
  let failed = 0;

  for (const file of files) {
    try {
      const res = await convertFile(file, opts, format);
      const percent = res.before ? Math.round((1 - res.after / res.before) * 100) : 0;
      const change = percent >= 0 ? '-' + percent + '%' : '+' + -percent + '%';

      console.log('  ok  ' + file + ' -> ' + res.outFile +
        '  (' + humanSize(res.before) + ' -> ' + humanSize(res.after) + ', ' + change + ')');
      ok++;
    } catch (err) {
      console.error('  !!  ' + file + ': ' + err.message);
      failed++;
    }
  }

  console.log('\nDone: ' + ok + ' converted, ' + failed + ' failed.');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Unexpected error: ' + err.message);
  process.exit(1);
});
