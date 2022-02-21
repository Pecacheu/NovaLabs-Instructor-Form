//Node.js Webserver Engine v3.2, ©2021 Pecacheu. GNU GPL v3.0
import path from 'path'; import fs from 'fs'; import url from 'url';
const root = path.dirname(url.fileURLToPath(import.meta.url));
let debug, chalk;

const contentTypes = {
	'.html': "text/html",
	'.php':  "text/html",
	'.css':  "text/css",
	'.png':  "image/png",
	'.svg':  "image/svg+xml",
	'.js':   "application/javascript",
	'.pdf':  "application/pdf",
	'.mp4':  "video/mp4",
	'.ogg':  "video/ogg",
	'.webm': "video/webm"
}, videoTypes = ['.mp4', '.ogg', '.webm'],
ex = {types:contentTypes, root:root};

ex.handle = function(dirPath, res, req, virtualDir) {
	const uri=url.parse(req.url).pathname,
	file=resolve(dirPath, uri, virtualDir);
	if(file) {
		fs.readFile(file, (err, data) => {
			if(err) {
				//Problem Reading File:
				sendCode(res, 500, err);
				if(debug) console.log(chalk.red("-- Read error: "+err));
			} else {
				//Send File Contents:
				let hdr={}, stat=200, cType=contentTypes[path.extname(file)];
				if(cType) hdr["Content-Type"] = cType;
				//Video Files:
				if(videoTypes.indexOf(path.extname(file)) != -1) {
					if(req.headers["range"]) {
						hdr["Accept-Ranges"] = "bytes";
						let range=req.headers["range"].replace('=',' '), dl=data.length;
						hdr["Content-Range"] = range+(dl-1)+"/*";
						hdr["Content-Length"]=dl; stat=206;
					}
				}
				res.writeHead(stat,hdr); res.write(data); res.end();
				if(debug) logFile(file.substring(root.length), cType);
			}
		});
	} else {
		//File not found:
		sendCode(res, 404, "Resource Not Found");
		if(debug) console.log(chalk.red("-- File not found"));
	}
}

function logFile(name, hasType) {
	const typeExtend = (hasType?" with type '"+path.extname(name).substring(1)+"'":'');
	console.log(chalk.dim("-- Served file '"+name+"'"+typeExtend));
}

function resolve(rootDir, uri, vDir) {
	if(uri.indexOf('..') !== -1) return false;
	let file = path.join(root, processUri(rootDir, uri, vDir));
	if(!fs.existsSync(file)) { //File doesn't exist:
		if(fs.existsSync(file+'.html')) return file+'.html'; else return false;
	} else if(fs.lstatSync(file).isDirectory()) { //File is directory:
		file = path.join(file, '/index.html');
		if(fs.existsSync(file)) return file; else return false;
	}
	return file;
}
 
function processUri(root, uri, vDir) {
	if(Array.isArray(vDir)) {
		for(let i=0,l=vDir.length,f; i<l; i++) {
			f = parseUriSub(uri, vDir[i]); if(f) return f;
		}
	} else if(typeof(vDir) == 'string') {
		const f = parseUriSub(uri, vDir); if(f) return f;
	}
	return root+uri;
}

function parseUriSub(uri, dir) {
	while(dir.substr(-1) == '/') dir = dir.substr(0,dir.length-1);
	let name; const ni = dir.lastIndexOf('/');
	if(ni == -1) name = '/'+dir; else { name = dir.substr(ni); if(name.length <= 1) return null; }
	if(uri.startsWith(name)) {
		if(uri.length > name.length && uri.charAt(name.length) != '/') return null;
		return dir+uri.substr(name.length);
	}
	return null;
}

function sendCode(res, code, msg) {
	res.writeHead(code);
	res.write("<pre style='font-size:16pt'>"+msg+"</pre>");
	res.end();
}

Object.defineProperty(ex, 'debug', {set:d => {if(debug=d) import('chalk').then(c => chalk=c.default)}});
export default ex;