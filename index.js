//Node.js Auto Loader v3.4, Copyright (©) 2019 Bryce Peterson (pecacheu@gmail.com)
"use strict";

const os = require('os'), fs = require('fs'), dns = require('dns'),
http = require('http'), exec = require('child_process').execFile;
let sysOS, sysArch, sysCPU; getOS();

//------------------------------------ CONFIGURATION OPTIONS ------------------------------------

let debug = false, //<- Debug Mode Enable
deleteDir = false, //<- Delete Entire Module Directory and Reinstall if Incomplete
autoInstallOptionals = true, //<- Also Install Optional Packages During Required Package Installation
npmInstallNames = ["chalk", "socket.io", "sendmail", "string-strip-html", "argon2"], //<- Dependencies List
optionalInstall = [], //<- Optional Dependencies
externalFiles = [], //<- Optional Site Resources
extFilePath = "/root/resources/"; //<- Resource Download Location

//------------------------------------ END OF CONFIG OPTIONS ------------------------------------

const ipList = getIPList();
console.log("IP Address List:",ipList,"\nOperating System: "+sysOS+", "+sysArch);
if(debug) console.log("CPU: "+sysCPU+"\n\nWarning, Debug Mode Enabled.");
console.log("\nChecking for Dependencies...");

if(verifyDepends()) {
	//------------------------------------------ MAIN CODE ------------------------------------------
	const chalk = require('chalk');
	console.log(chalk.gray("All Dependencies Found!\n"));
	require("./server").begin(ipList);
	//-------------------------------------- END OF MAIN CODE ---------------------------------------
} else {
	console.log("Dependencies Missing!\n");
	runJSLoader();
}

//Auto Installer Functions:

function verifyDepends() {
	if(process.argv.length > 2 && process.argv[2] == "reload") { deleteDir=1; return 0; }
	let p=1; for(let n=0,l=npmInstallNames.length,ns,name; n<l; n++) {
		ns=npmInstallNames[n].split(" as "), name=ns[0]; if(ns.length > 1) name=ns[1];
		if(!fs.existsSync(__dirname+"/node_modules/"+name)) { p=0; break; }
	}
	for(let n=0,l=externalFiles.length,fn; n<l; n++) {
		fn=externalFiles[n]; fn=fn.substr(fn.lastIndexOf('/')+1);
		if(!fs.existsSync(extFilePath+fn)) { p=0; break; }
	}
	return p;
}

let ind;
function runJSLoader() {
	console.log("Starting Installer...\n");
	checkInternet((res) => {
		if(!res) { console.log("Error: No Internet Connection Detected!"); process.exit(); return; }
		if(externalFiles.length) {
			console.log("Downloading Resources..."); mkDir(__dirname+extFilePath,1);
			ind=0; http.get(externalFiles[ind], httpRes);
		} else doInstall();
	});
}

function httpRes(rs) {
	let fn=externalFiles[ind]; fn=fn.substr(fn.lastIndexOf('/')+1);
	let file = fs.createWriteStream(__dirname+extFilePath+fn); rs.pipe(file);
	file.on('finish', () => {
		console.log("Downloaded '"+fn+"'");
		if(++ind == externalFiles.length) { console.log(); doInstall(); }
		else http.get(externalFiles[ind], httpRes);
	});
}

function doInstall() {
	if(deleteDir) { console.log("Deleting Install Directory...\n"); remDir(__dirname+"/node_modules"); }
	console.log("Installing Node.js Modules...");
	if(autoInstallOptionals) Array.prototype.push.apply(npmInstallNames, optionalInstall);
	ind=0; installRun();
}

function installRun() {
	if(ind == npmInstallNames.length) {
		remDir(__dirname+"/package-lock.json");
		console.log("Installer Finished. Exiting..."); process.exit(); return;
	}
	let ns=npmInstallNames[ind].split(" as "),mod=ns[0],inst=mod; if(ns.length > 1) mod=ns[1];
	ind++; if(deleteDir || !fs.existsSync(__dirname+"/node_modules/"+mod)) {
		console.log("Installing NPM Module: "+mod+"\n");
		let cmd = exec(sysOS=="Windows"?"npm.cmd":"npm", ["install",inst], {cwd:__dirname});
		cmd.stdout.pipe(process.stdout); cmd.stderr.pipe(process.stdout);
		cmd.on('error', (e) => { console.error("Error: "+e); cmd.removeAllListeners(); });
		cmd.on('close', () => { console.log("Module '"+mod+"' Installed.\n"); installRun(); });
	} else { console.log("Skipping '"+mod+"' Module.\n"); installRun(); }
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

function checkInternet(cb) { dns.resolve("www.google.com", (e) => {cb(!e)}); }
function getIPList() {
	const ip=[], fl=os.networkInterfaces();
	for(let k in fl) fl[k].forEach((f) => { if(!f.internal && f.family == "IPv4"
	&& f.mac != "00:00:00:00:00:00" && f.address) ip.push(f.address); });
	return ip.length?ip:0;
}

function getOS() {
	switch(os.platform()) {
		case "win32": sysOS = "Windows"; break;
		case "darwin": sysOS = "Macintosh OS"; break;
		case "linux": sysOS = "Linux"; break;
		default: sysOS = os.platform();
	}
	switch(os.arch()) {
		case "ia32": sysArch = "32-bit"; break;
		case "x64": sysArch = "64-bit"; break;
		case "arm": sysArch = "ARM"; break;
		default: sysArch = os.arch();
	}
	sysCPU = os.cpus()[0].model;
}