import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import C from 'chalk';

import CssMinimizerPlugin from 'css-minimizer-webpack-plugin';
import ForkTsCheckerWebpackPlugin from 'fork-ts-checker-webpack-plugin';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import { minify as mJS } from 'terser';
import TerserPlugin from 'terser-webpack-plugin';

const log = console.log,
	UTF = {encoding: 'utf8'},
	R_SC = /;\n?(\/\/#.+)?$/,
	src = path.join(import.meta.dirname, 'src/web'),
	dist = path.join(import.meta.dirname, 'dist'),
	entry = 'form';

//==== Support ====

const rm = p => fs.rm(p, {recursive: true})
	.catch(e => {if(e.code !== 'ENOENT') throw e;});

const run = cmd => new Promise((res, rej) => {
	cmd = spawn(cmd, {shell: true, stdio: 'inherit'});
	cmd.on('error', rej), cmd.on('exit', c => c ? rej(`Exit Code ${c}`) : res());
});

async function recurse(func, pin) {
	const pl = [], d = await fs.readdir(pin, {withFileTypes: true});
	for(const f of d) {
		if(f.isFile()) pl.push(func(pin, f.name));
		else if(f.isDirectory()) pl.push(recurse(func, path.join(pin, f.name)));
	}
	await Promise.all(pl);
}

//==== Options ====

const terserOptions = {
	ecma: 2020,
	module: true,
	format: {
		inline_script: false,
		comments: false
	},
	compress: {
		passes: 2,
		arguments: true,
		keep_fargs: false,
		keep_infinity: true,
		unsafe: true
	}
};

async function minify(pin, fn) {
	try {
		let fin = pin + '/' + fn, ext = path.extname(fn), out, f;
		if(ext === '.js') {
			const map = fin + '.map';
			f = await fs.readFile(fin, UTF);
			await getSrc(map);
			out = await mJS(f, terserOptions), f = out.code;
			f = f.replace(R_SC, '$1');
			await fs.writeFile(fin, f);
			log(C.cyan(`- ${fn}`));
			if(out.map) {
				await fs.writeFile(map, out.map);
				log(C.cyan(`- ${fn}.map`));
			}
		} else if(ext !== '.map') {
			log(C.dim(`- ${fn}`));
		}
	} catch(e) {
		log(C.red(`- ${fn}`));
		throw e;
	} finally {delete terserOptions.sourceMap}
}

async function getSrc(map) {
	try {
		terserOptions.sourceMap = {
			content: await fs.readFile(map, UTF),
			url: path.basename(map)
		};
	} catch(e) {}
}

export default async (_, argv) => {
	const dev = argv.mode === 'development';

	//Build server
	if(!dev) {
		log(C.bgYellow('Clean'));
		await rm(dist);
		log(C.bgYellow('Build Server'));
		await run('npx tsc -p src/srv');
		log(C.bgYellow('Minify Server'));
		await recurse(minify, dist + '/srv');
	}

	log(C.bgYellow('Build'));

	const opts = {
		entry: `${src}/${entry}.ts`,
		context: src,
		output: {
			filename: entry + '.js',
			path: dist + '/web'
		},
		module: {
			rules: [
				{test: /(?<!\.d)\.ts$/, use: 'ts-loader'},
				{test: /\.css$/i, use: [MiniCssExtractPlugin.loader, 'css-loader']},
				{test: /\.html$/i, use: ['html-loader']},
				{test: /\.svg$/, type: 'asset/resource'}
			]
		},
		plugins: [
			new HtmlWebpackPlugin({
				template: src + '/index.html',
				filename: 'index.html',
				inject: 'head'
			}),
			new MiniCssExtractPlugin({runtime: false}),
			new ForkTsCheckerWebpackPlugin()
		],
		watchOptions: {ignored: '/node_modules'},
		resolve: {symlinks: false}
	};

	if(!dev) opts.optimization = {
		minimizer: [
			new TerserPlugin({
				extractComments: false,
				terserOptions
			}),
			new CssMinimizerPlugin({
				minimizerOptions: {
					preset: [
						'default',
						{discardComments: {removeAll: true}}
					]
				}
			})
		]
	};

	return opts;
};