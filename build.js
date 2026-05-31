//Auto Build v2.2, Pecacheu 2026. GNU GPL v3

import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import mHTML from '@minify-html/node';
import { htmlPlugin } from '@pecacheu/esbuild-plugin-html';
import C from 'chalk';
import * as esbuild from 'esbuild';
import { minify as mJS } from 'terser';

//Paths
const app = '/form.ts',
	src = 'src',
	dist = 'dist',
	srcCli = src + '/web',
	distCli = dist + '/web',
	srcSrv = src + '/srv';

//Options
const Mode = process.argv[2],
	Watch = Mode === 'watch',
	Dev = Watch || Mode === 'dev',
	Meta = Mode === 'meta',
	log = console.log,
	UTF = {encoding: 'utf8'},
	R_NL = /\n$/,
	R_SC = /;\n?(\/\/#.+)?$/,
	minExt = ['.js', '.html'],
	trimExt = ['.css', '.svg'],
	_hFD = [],
	jsOpts = {
		ecma: 2020,
		module: true,
		format: {inline_script: false, comments: false},
		mangle: {properties: {regex: /^[_#]/}},
		compress: {passes: 2, arguments: true, keep_fargs: false, keep_infinity: true, unsafe: true}
	},
	htmlOpts = {
		allow_optimal_entities: true,
		allow_removing_spaces_between_attributes: true,
		minify_css: true,
		minify_js: true
	},
	htmlLoadOpts = {
		scriptLoading: 'module'
	},
	esOpts = {
		entryPoints: [srcCli + app],
		bundle: true,
		minify: !Dev,
		sourcemap: Dev,
		format: 'esm',
		splitting: true,
		metafile: Meta ? true : undefined,
		loader: {
			'.svg': 'file',
			'.jpg': 'file',
			'.woff': 'copy',
			'.woff2': 'copy'
		},
		plugins: [],
		target: `es${jsOpts.ecma}`,
		outdir: distCli
	};

//==== Minify ====

async function minify(pin, _, fn) {
	let fin = `${pin}/${fn}`, ext = path.extname(fn), f;
	const fls = fin.slice(dist.length + 1);
	try {
		if(fin.indexOf('.min') !== -1) return;
		if(minExt.includes(ext)) { //Minify
			if(ext === '.js') {
				const map = `${fin}.map`;
				f = await fs.readFile(fin, UTF);
				await getSrc(map);
				const out = await mJS(f, jsOpts);
				f = out.code.replace(R_SC, '$1');
				if(out.map) {
					await fs.writeFile(map, out.map);
					log(C.cyan(`- ${fls}.map`));
				}
			} else {
				f = mHTML.minify(await fs.readFile(fin), htmlOpts);
			}
			await fs.writeFile(fin, f);
			log(C.cyan(`- ${fls}`));
		} else if(trimExt.includes(ext)) { //Trim
			f = (await fs.readFile(fin, UTF)).replace(R_NL, '');
			await fs.writeFile(fin, f);
			log(C.magenta(`- ${fls}`));
		} else { //Log
			log(C.dim(`- ${fls}`));
		}
	} catch(e) {
		log(C.red(`- ${fls}`));
		throw e;
	} finally {delete jsOpts.sourceMap}
}

async function getSrc(map) {
	try {
		jsOpts.sourceMap = {
			content: await fs.readFile(map, UTF),
			url: path.basename(map)
		};
	} catch(e) {}
}

function addHTML(pin, _, fn) {
	if(fn.endsWith('.html') && fn[0] !== '+') _hFD.push({
		filename: fn, htmlFile: `${pin}/${fn}`, ...htmlLoadOpts
	});
}

//==== Support ====

async function mkdir(p) {
	try {await fs.mkdir(p, true)} catch(e) {
		if(e.code !== 'EEXIST') throw e;
	}
}
async function rm(p) {
	try {await fs.rm(p, {recursive: true})} catch(e) {
		if(e.code !== 'ENOENT') throw e;
	}
}

const run = cmd => new Promise((res, rej) => {
	cmd = spawn(cmd, {shell: true, stdio: 'inherit'});
	cmd.on('exit', c => c ? rej(`Exit Code ${c}`) : res());
	cmd.on('error', rej);
});

async function recurse(func, pin, pout) {
	let pl = [], d = await fs.readdir(pin, {withFileTypes: true});
	if(pout) await mkdir(pout);
	for(let f of d) {
		if(f.isFile()) pl.push(func(pin, pout, f.name));
		else if(f.isDirectory()) pl.push(recurse(func,
			path.join(pin, f.name), pout && path.join(pout, f.name)));
	}
	await Promise.all(pl);
}

//==== Pipeline ====

if(!Dev) {
	log(C.bgYellow('Clean'));
	await rm(dist);

	log(C.bgYellow('Build Server'));
	await run(`npx tsc -p ${srcSrv}`);
}

await mkdir(srcCli);

log(C.bgYellow('Build Client'));
await recurse(addHTML, srcCli);
esOpts.plugins.push(htmlPlugin({files: _hFD}));
const ctx = await esbuild.context(esOpts);

if(Watch) {
	await ctx.watch();
	log('Watching for changes...');
} else {
	const build = await ctx.rebuild();
	if(Meta) await fs.writeFile('meta.json', JSON.stringify(build.metafile));

	if(!Dev) {
		log(C.bgYellow('Minify'));
		await recurse(minify, dist);
	}

	log(C.green('Done!'));
	await ctx.dispose();
}