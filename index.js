//Nodejs AutoLoader v3.5, ©2021 Pecacheu. GNU GPL v3.0
'use strict';

import os from 'os'; import fs from 'fs'; import dns from 'dns';
import http from 'http'; import {spawn} from 'child_process';
import {dirname} from 'path'; import {fileURLToPath} from 'url';
let ind, dir=dirname(fileURLToPath(import.meta.url)),
sysOS, sysArch, sysCPU; getOS();

//------------------------------------ CONFIGURATION OPTIONS ------------------------------------

let debug = false, //<- Debug Mode Enable
deleteDir = false, //<- Delete Entire Module Directory and Reinstall if Incomplete
autoInstallOptionals = true, //<- Also Install Optional Packages During Required Package Installation
npmInstallNames = ["chalk", "socket.io", "nodemailer", "string-strip-html", "argon2"], //<- Dependencies List
optionalInstall = [], //<- Optional Dependencies
wgetFiles = [], //<- Optional Site Resources
wgetPath = ""; //<- Resource Download Location

async function doMain() { //<- Main Code
	const chalk = (await import('chalk')).default;
	console.log(chalk.gray("All Dependencies Found!\n"));
	(await import('./server.js')).begin(ipList);
}

//------------------------------------ END OF CONFIG OPTIONS ------------------------------------

const ipList = getIPList();
console.log("IP:",ipList,"OS: "+sysOS+", "+sysArch+"\nCPU: "+sysCPU+'\n'+
(debug?"Warning, Debug Mode Enabled.\n":'')+"\nChecking Packages...");
if(verifyDepends()) doMain(); else runJSLoader();

function verifyDepends() {
	let v=process.version; if(!(Number(v.substr(1,v.indexOf('.')-1)) >= 14))
		console.log("Nodejs",v,"too old, please update to >= v14!"),process.exit();
	if(process.argv.length > 2 && process.argv[2] == "reload") { deleteDir=1; return 0; }
	let p=1; for(let n=0,l=npmInstallNames.length,ns,name; n<l; n++) {
		ns=npmInstallNames[n].split(" as "), name=ns[0]; if(ns.length > 1) name=ns[1];
		if(!fs.existsSync(dir+"/node_modules/"+name)) { p=0; break; }
	}
	if(!wgetPath.endsWith('/')) wgetPath+='/';
	for(let n=0,l=wgetFiles.length,fn; n<l; n++) {
		fn=wgetFiles[n]; fn=fn.substr(fn.lastIndexOf('/')+1);
		if(!fs.existsSync(wgetPath+fn)) { p=0; break; }
	}
	return p;
}

function runJSLoader() {
	console.log("Dependencies Missing!\n");
	checkInternet(res => {
		if(!res) console.log("Error: No Internet Connection!"),process.exit();
		if(wgetFiles.length) {
			console.log("Downloading Resources..."); mkDir(dir+wgetPath,1);
			ind=0; http.get(wgetFiles[ind], httpRes);
		} else doInstall();
	});
}

function httpRes(rs) {
	let fn=wgetFiles[ind]; fn=fn.substr(fn.lastIndexOf('/')+1);
	let file = fs.createWriteStream(dir+wgetPath+fn); rs.pipe(file);
	file.on('finish', () => {
		console.log("Downloaded",fn);
		if(++ind == wgetFiles.length) console.log(),doInstall();
		else http.get(wgetFiles[ind], httpRes);
	});
}

function doInstall() {
	if(deleteDir) { console.log("Deleting Install Directory..."); remDir(dir+"/node_modules"); }
	console.log("Installing Node.js Modules...");
	if(autoInstallOptionals) Array.prototype.push.apply(npmInstallNames, optionalInstall);
	ind=0; installRun();
}

function installRun() {
	if(ind == npmInstallNames.length) {
		remDir(dir+"/package-lock.json");
		console.log("Installer Finished. Exiting..."); process.exit();
	}
	let ns=npmInstallNames[ind].split(" as "),mod=ns[0],inst=mod; if(ns.length > 1) mod=ns[1];
	ind++; if(deleteDir || !fs.existsSync(dir+"/node_modules/"+mod)) {
		console.log("Installing",mod);
		let cmd=spawn('npm', ['i',inst], {cwd:dir, windowsHide:true, shell:true, stdio:'inherit'});
		cmd.on('error', e => { if(e) console.error(e); cmd.removeAllListeners(); });
		cmd.on('close', c => { if(!c) console.log(mod,"Installed."),installRun(); });
	} else console.log("Skipping",mod),installRun();
}

function mkDir(path, noDel) {
	if(fs.existsSync(path)) {
		if(noDel && fs.lstatSync(path).isDirectory()) return;
		else remDir(path);
	}
	fs.mkdirSync(path);
}

function remDir(p,c) {
	if(!c) { if(p.endsWith('/')) p=p.substr(0,p.length-1); if(!fs.existsSync(p)) return; }
	if(!fs.lstatSync(p).isDirectory()) { fs.unlinkSync(p); return; }
	let d=fs.readdirSync(p); for(let s in d) remDir(p+"/"+d[s],1); fs.rmdirSync(p);
}

function checkInternet(cb) { dns.resolve("google.com", e => {cb(!e)}); }
function getIPList() {
	const ip=[], fl=os.networkInterfaces();
	for(let k in fl) fl[k].forEach(f => { if(!f.internal && f.family == 'IPv4'
	&& f.mac != '00:00:00:00:00:00' && f.address) ip.push(f.address); });
	return ip.length?ip:0;
}

function getOS() {
	switch(os.platform()) {
		case "win32": sysOS="Windows"; break;
		case "darwin": sysOS="MacOS"; break;
		case "linux": sysOS="Linux"; break;
		default: sysOS=os.platform();
	}
	switch(os.arch()) {
		case "ia32": sysArch="32-bit"; break;
		case "x64": sysArch="64-bit"; break;
		case "arm": sysArch="ARM"; break;
		default: sysArch=os.arch();
	}
	sysCPU=os.cpus()[0].model;
}