//This work is licensed under a GNU General Public License, v3.0. Visit http://gnu.org/licenses/gpl-3.0-standalone.html for details.
//Node.js Webserver Engine v3.12, Copyright (©) 2017 Bryce Peterson (Nickname: Pecacheu, Email: Pecacheu@gmail.com)

const path = require("path"), fs = require("fs");
let debug = false, chalk = null;

"use strict";

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
};

const videoTypes = ['.mp4', '.ogg', '.webm'];

function handleRequest(dirPath, uri, response, request, virtualDir) {
	const file = resolve(dirPath, uri, virtualDir);
	//Check for file:
	if(file) {
		//Read the file:
		fs.readFile(file, function(err, data) {
			if(err) {
				//Problem Reading File:
				sendCode(response, 500, err);
				if(debug) console.log(chalk.red("-- Read error: "+err));
			} else {
				//Send File Contents:
				var headers = {}, respType = 200;
				var contentType = contentTypes[path.extname(file)];
				if(contentType) headers["Content-Type"] = contentType;
				//Video Files:
				if(videoTypes.indexOf(path.extname(file)) != -1) {
					if(request.headers["range"]) {
						headers["Accept-Ranges"] = "bytes";
						var range = request.headers["range"].replace('=', ' ');
						var dataBytes = Buffer.byteLength(data.toString());
						//headers["Content-Range"] = range+(dataBytes-1)+"/"+dataBytes;
						headers["Content-Range"] = range+(dataBytes-1)+"/*";
						headers["Content-Length"] = dataBytes; respType = 206;
					}
				}
				response.writeHead(respType, headers);
				response.write(data); response.end();
				if(debug) logServedFile(file.substring(__dirname.length), contentType);
			}
		});
	} else {
		//File not found:
		sendCode(response, 404, "Resource Not Found");
		if(debug) console.log(chalk.red("-- File not found"));
	}
}

function logServedFile(name, hasType) {
	const typeExtend = (hasType?" with type '"+path.extname(name).substring(1)+"'":'');
	console.log(chalk.dim("-- Served file '"+name+"'"+typeExtend));
}

function resolve(rootDir, uri, vDir) {
	if(uri.indexOf('..') !== -1) return false;
	let file = path.join(__dirname, processUri(rootDir, uri, vDir));
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
	if(startsWith(uri, name)) {
		if(uri.length > name.length && uri.charAt(name.length) != '/') return null;
		return dir+uri.substr(name.length);
	}
	return null;
}

function startsWith(a, b) {
	const blen = b.length;
	if(a.length >= blen && a.substr(0,blen) == b) return true;
	return false;
}

function sendCode(resp, code, msg) {
	resp.writeHead(code);
	resp.write("<pre style='font-size:16pt'>"+msg+"</pre>");
	resp.end();
}

exports.handleRequest = handleRequest; exports.types = contentTypes;
Object.defineProperty(exports, 'debug', {get:function(db) { if(db) chalk = require('chalk'); debug = db; }});