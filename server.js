//This work is licensed under a GNU General Public License, v3.0. Visit http://gnu.org/licenses/gpl-3.0-standalone.html for details.
//Powered By: Linked JS Server v1.42, Copyright (©) 2019 Bryce Peterson (pecacheu@gmail.com)
const VERSION = 'v2.2';

const router = require('./router'), http = require('http'), url = require('url'),
chalk = require('chalk'), socketio = require('socket.io'), mail = require('sendmail')({silent:true});
let clients = {}, serverIP;

"use strict";

//Config Options:
const debug = false;
const Port = 8020, Path = "/root", ServerName = "Automated Forms Server";
const SEND_TIMEOUT = 15000;

//Filter Patterns:
const pTitle = /^[\w\-:.<>()[\]&*%!, ]+$/, pText = /^[\w\+\-(). ]+$/,
pEmail = /^\w+(?:[\.+-]\w+)*@\w+(?:[\.-]\w+)*\.\w\w+$/, pDate = /^[\w,: ]+$/;

//Messages:
const msgHeader = "{ NovaLabs FormBot Automated Message }", bStyle = 'font:20px "Segoe UI",Helvetica,Arial',
noHTML = "\nHTML-enabled viewer is required for viewing this message.\n\nPowered by bTech.";

//Email Addresses:
const mailHost = 'formbot@nova-labs.org', accAddr = ['formbot-events-relay@nova-labs.org'],
memAddr = 'formbot-membership-relay@nova-labs.org', TEST_MAIL = 'pecacheu@gmail.com';

//Auth Keys:
/*const ApiKey = "0", ApiSecret = "0", RedirUri = "https://nova-labs.org",
AuthUri = "https://secure.meetup.com/oauth2/authorize?client_id="+ApiKey+"&response_type=code&redirect_uri="+RedirUri,
ValUri = "https://secure.meetup.com/oauth2/access", ValData = "client_id="+ApiKey+"&client_secret="
+ApiSecret+"&grant_type=authorization_code&redirect_uri="+RedirUri+"&code=",
ValOpt = {method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}};*/

//Entry Point:
exports.begin = function(ipList) {
	console.log(chalk.yellow("Link.js Server, [FormBot "+VERSION+"]"));
	console.log(chalk.yellow("Type 'exit' or 'quit' to stop server.\nType 'list' for list of clients.")+'\n');
	
	serverIP = (ipList?ipList[0]:'localhost');
	console.log("Starting "+chalk.bgRed.bold.white(ServerName)+'\n');
	if(debug == 2) router.debug = debug; handleInput(); startServer();
}

//Allows you to quit by typing exit:
function handleInput() {
	process.stdin.resume();
	process.stdin.setEncoding('utf8');
	process.stdin.on('data', function(cmd) {
		for(let s; (s=cmd.search(/[\n\r]/)) != -1;) cmd = cmd.substring(0,s);
		if(cmd == 'exit' || cmd == 'quit' || cmd == 'stop') {
			console.log(chalk.magenta("Exiting...")); process.exit();
		} else if(cmd == 'list') {
			console.log("clientList:",chalk.yellow(logClientList()));
		} else {
			console.log(chalk.red("Unknown command '"+cmd+"'"));
		}
	});
}

//Starts internal web server:
function startServer() {
	function onRequest(req, resp) {
		const uri = url.parse(req.url), pathname = uri.pathname;
		if(debug) console.log("[ROUTER] Request for "+pathname+" received");
		router.handleRequest(Path, pathname, resp, req);
	}
	const hostServer = http.createServer(onRequest).listen(Port, function() {
		console.log(chalk.green("Web Server Started!"));
		console.log("To connect, open your browser and go to "+chalk.bgYellow.white('http://'+serverIP+':'+Port)+'\n');
	});
	initSockets(hostServer);
}

//Creates socket connection to internal server:
function initSockets(host) {
	socketio.listen(host).on('connection', function(socket) {
		console.log(chalk.cyan("[SOCKET] Establishing client connection..."));
		
		//Handle premature disconnection:
		socket.on('disconnect', function() {
			this.removeAllListeners();
			console.log(chalk.red("[SOCKET] Client disconnected prematurely!"));
		});
		
		//Initial connection event:
		socket.once('type', function(sType) {
			if(typeof sType != 'string' && typeof sType != 'number') { console.log(chalk.red("[SOCKET] Bad response: initType")); return; }
			
			this.type = sType; if(!clients[sType]) clients[sType] = []; this.ind = clients[sType].length; clients[sType].push(this);
			console.log(chalk.yellow("[SOCKET] Client connected! {type="+this.type+",id="+this.ind+"}"));
			
			if(debug) console.log("clientList:",logClientList());
			this.cliLog = function(clr, msg) {console.log(chalk[clr]("[SOCKET "+this.type+":"+this.ind+"] "+msg))}
			this.cliErr = function(msg) {this.cliLog('red',msg)}
			
			//Forward events:
			this.on('bcast', function(type, data, destType) {
				if(typeof type != 'string') { this.cliErr("Bad response: eventType"); return; }
				if(data && typeof data != 'object') { this.cliErr("Bad response: eventData"); return; }
				if(destType != null && typeof destType != 'string' && typeof destType != 'number') {
					this.cliErr("Bad response: eventDestType"); return;
				}
				if(debug) this.cliLog('green', "Got "+chalk.yellow(type)+" event");
				sendToAll(type,data,this,destType); //Forward event to all other clients.
			});
			
			//Custom events:
			/*this.on('authKey', function() { this.emit('authKey',AuthUri); });
			this.on('valKey', function(code) {
				const req = https.request(ValUri, ValOpt, function(res) {
					let data = ''; res.on('data', function(d) { data += d; });
					res.on('end', function() {
						try { data = JSON.parse(data); } catch(e) { data = {error:e}; }
						this.emit('valKey',data);
					});
				});
				req.on('error', function(e) { ack(this,event,e); });
				req.write(ValData+code); req.end();
			});*/
			this.on('sendForm', function(title, date, uName, uMail, data, dataType, aList, eventMatch, isSignOff) {
				const event = 'sendForm';
				//Error checking:
				if(typeof title != 'string' || title.length > 80 || !pTitle.test(title)) { ack(this,event,"Bad input: title"); return; }
				if(typeof date != 'string' || date.length > 80 || !pDate.test(date)) { ack(this,event,"Bad input: date"); return; }
				if(typeof uName != 'string' || !pText.test(uName)) { ack(this,event,"Bad input: instructorName"); return; }
				if(typeof uMail != 'string' || !pEmail.test(uMail)) { ack(this,event,"Bad input: instructorMail"); return; }
				if(typeof data != 'string' || data.length < 1) { ack(this,event,"Bad input: data"); return; }
				if(data.length > 20000) { ack(this,event,"Data exceeded maximum length (20000)"); return; }
				if(typeof dataType != 'string' || dataType.length !== 3) { ack(this,event,"Invalid data type!"); return; }
				if(eventMatch && typeof eventMatch != 'object') { ack(this,event,"Bad input: eventMatch"); return; }
				if(!Array.isArray(aList) || aList.length > 200) { ack(this,event,"Bad input: attendeeList"); return; }
				if(!(isSignOff >= 0) || isSignOff && !aList.length) { ack(this,event,"Bad input: isSignOff"); return; }
				//Attendee List Error Checking:
				for(let i=0,a,err=false,l=aList.length; i<l; i++) {
					a=aList[i]; if(a.length !== 3) err = "Invalid Length";
					if(typeof a[0] != 'string' || a[0].length > 80 || !pText.test(a[0])) err = "Name Invalid";
					if(typeof a[1] != 'string' || a[1].length > 80 || !pEmail.test(a[1])) err = "Email Invalid";
					if(typeof a[2] != 'number' || !(a[2] >= 0)) err = "ID Invalid";
					if(err) { ack(this,event,"Bad input: attendeeList["+i+"]: "+err); return; }
				}
				this.cliLog('yellow',"("+event+") Submitting '"+title+"'...");
				//Generate Meetup Event & Auto Timeout:
				const subject = (uMail=='liamg@gmail.com'?"<<FORMBOT_"+VERSION+"_TEST>>":"FormBot: ")+title+" on "+date,
				self = this, evHTML = genMeetup(eventMatch), aTable = aList.length?(isSignOff==2?"<p style='color:#f00'><b>Note:</b>"+
				" Safety Sign-Off Only. Do not sign off on individual tools.</p>":'')+"<p>Event Attendee List:</p>"+genTable(aList):'';
				if(typeof evHTML != 'string') { ack(this,event,"Error generating meetup data: "+evHTML[0]); return; }
				let okay = 0, timer = setTimeout(function() { ack(self,event,"Failed to send email: Timed out!"); }, SEND_TIMEOUT);
				function cancel() { if(timer != null) clearTimeout(timer); timer = null; }
				//Send PDF to addresses:
				const addrList = accAddr.slice(); addrList.push(uMail=='liamg@gmail.com'?TEST_MAIL:uMail);
				let atp=title.indexOf('-'), atName = title.substr(0,atp==-1?title.length:atp).replace(/\s/g,''),
				okLen = addrList.length-1; if(isSignOff) okLen++;
				for(let i=0,l=addrList.length; i<l; i++) {
					const addr = addrList[i]; console.log(chalk.yellow("Sending to "+addr));
					mail({
						from:mailHost, to:addr, subject:subject, text:msgHeader+noHTML,
						html:"<body style='"+bStyle+"'><p><b>"+msgHeader+"</b></p>"+
						evHTML+(i==l-1?aTable:'')+"<br>Powered by bTech.</body>",
						attachments:[
							{filename:atName+'.'+dataType, contentType:router.types['.'+dataType]||'text/plain', content:data}
						]
					}, function(err, reply) {
						if(err && err.message != 'read ECONNRESET') {
							cancel(); ack(self,event,"Failed to send to "+addr+": "+err.message); self.cliErr(err); return;
						} else if(err) self.cliErr(">>SUPPRESSED ERROR MSG<< "+err);
						self.cliLog('yellow',addr+" : Email sent!"); console.log("REPLY:",reply);
						if(okay >= okLen) { cancel(); ack(self,event); } else okay++;
					});
				}
				//Send attendee list to membership:
				if(isSignOff) {
					this.cliLog('yellow',"("+event+") Also sending attendee list to membership...");
					//Generate Message Content:
					const HTML = "<body style='"+bStyle+"'><p><b>"+msgHeader+"</b></p><p>Filled out by: "
					+uName+" ("+uMail+")</p>"+evHTML+aTable+"<br>Powered by bTech.</body>";
					mail({
						from:mailHost, to:memAddr, subject:subject, text:msgHeader+noHTML, html:HTML
					}, function(err, reply) {
						if(err && err.message != 'read ECONNRESET') {
							cancel(); ack(self,event,"Failed to send to "+memAddr+": "+err.message); self.cliErr(err); return;
						} else if(err) self.cliErr(">>SUPPRESSED ERROR MSG<< "+err);
						self.cliLog('yellow',"Membership email sent!"); console.log("REPLY:",reply);
						if(okay >= okLen) { cancel(); ack(self,event); } else okay++;
					});
				}
			});
			
			//Handle disconnection:
			this.removeAllListeners('disconnect');
			this.on('disconnect', function() {
				this.removeAllListeners(); this.cliErr("Client disconnected\n");
				if(debug) console.log("old clientList:",logClientList()); const cList = clients[this.type]; cList.splice(this.ind,1);
				for(let i=0,l=cList.length,ind=this.ind; i<l; i++) { let s = cList[i]; if(s.ind > ind) { s.ind--; s.emit('index', s.ind); }}
				if(debug) console.log("new clientList:",logClientList());
			});
			this.emit('connection', this.ind); //Emit connection event.
		}); socket.emit('type'); //Send type request.
	});
}

function genTable(tb) {
	//Styles:
	const tStyle = 'overflow:hidden;max-width:1000px;color:#888;border-radius:10px;width:100%;border-collapse:'+
	'collapse;background:#f5f5f5;box-shadow:2px 2px 2px rgba(0,0,0,0.3);font-size:16px;table-layout:fixed',
	tdStyle = 'border-top:1px solid #eee;padding:9px 12px;line-height:15px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden',
	trFirstStyle = 'border-top:none;background:#eee', trEvenStyle = "style='background:#dcdcdc'",
	nameStyle = 'font-weight:700', mailStyle = 'color:#5299e2;font-weight:500', userStyle = 'text-align:right';
	//Generate Table:
	let listHTML = ''; function makeRow(a,i) {
		if(!a[2]) a[2] = ''; listHTML += "<tr "+(i%2?'':trEvenStyle)+"><td style='"+tdStyle+';'+nameStyle+"'>"+a[0]+"</td>"+
		"<td style='"+tdStyle+';'+mailStyle+"'>"+a[1]+"</td><td style='"+tdStyle+';'+userStyle+"'>"+a[2]+"</td></tr>";
	}
	for(let i=0,l=tb.length; i<l; i++) makeRow(tb[i],i);
	return "<table style='"+tStyle+"'><tr style='"+trFirstStyle+"'><th style='width:40%'>Name"+
	"</th><th>Email</th><th>Meetup ID</th></tr>"+listHTML+"</table>";
}

function genMeetup(em) {
	if(!em) return "<p>FormBot Couldn't Find This Event.</p>";
	const muEvent = 'width:550px;overflow:hidden;font-size:16px;border-radius:8px;padding:16px;border:1px solid rgba'+
	'(0,0,0,0.12);background:#fafafa;box-shadow:2px 2px 2px rgba(0,0,0,0.3); color:rgba(0,0,0,0.87)',
	muLink = 'color:inherit;display:inline-block;text-decoration:none;vertical-align:bottom;',
	muTitle = 'font-size:16pt;font-weight:600;white-space:pre-line', muDetail = 'margin-top:6px;width:70%;float:left',
	muVen = 'color:rgb(0,154,227)', muSub = 'color:rgba(0,0,0,0.54);font-size:13px', muDesc = 'margin-top:6px;line-height:1.35em;'+
	'display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;height:84px;overflow:hidden', muMeta = 'margin-top:8px;float:right',
	muRSVP = 'margin-top:6px;font-size:13.5px', muHosts = 'margin-top:6px;display:inline-block;width:100%;color:rgba(0,0,0,0.54);font-size:13px';
	let hostHTML = '', feeHTML = ''; //Event hosts:
	try { const eh = em.hosts; if(eh.length) {
		hostHTML = "Hosted By: "; for(let i=0,h,l=eh.length; i<l; i++) {
			h = eh[i]; hostHTML += (i===0?'':', ')+"<a href='https://meetup.com/"+em.gid+
			"/members/"+h[1]+"' target='_blank' style='"+muLink+muVen+"'>"+h[0]+"</a>";
		}
	}
	if(em.fee) { feeHTML = "<div style='margin-top:6px'>"+em.fee+"</div><div style='"+muSub+"'>"+em.feeDesc+"</div>"; }
	let html = "<p>FormBot Thinks This Event Is:</p>"+
	"<div style='"+muEvent+"'><a style='"+muLink+muTitle+"' href='"+em.link+"' target='_blank'>"+em.name+"</a>"+
	"<div style='"+muDetail+"'><a style='"+muLink+muVen+"' href='"+em.link+"' target='_blank'>"+em.ven+"</a><div style='"+
	muSub+"'>"+em.loc+"</div><div style='"+muDesc+"'>"+em.desc+"</div></div><div style='"+muMeta+"'><div style='"+muSub+
	';margin-bottom:6px'+"'>"+em.acc+" Match</div><div>"+em.time+"</div><div style='"+muSub+"'>"+em.date+"</div><div style='"+
	muRSVP+"'>"+em.yes+" Attendees<br>"+em.wait+" Waitlist</div>"+feeHTML+"</div><div style='"+muHosts+"'>"+hostHTML+"</div></div>";
	return html; } catch(e) { return [e.toString()]; }
}

function ack(cli, eType, stat) {
	if(typeof stat == 'string') {
		cli.cliErr("("+eType+") "+stat); cli.emit('ack',eType,false,stat);
	} else { cli.cliLog('green',"ACK true"); cli.emit('ack',eType,true); }
}

//Send event to all clients:
function sendToAll(type, data, skipCli, destType) {
	const cKeys = Object.keys(clients), tp = skipCli?skipCli.type:null, ind = skipCli?skipCli.ind:-1;
	for(let t=0,k=cKeys.length; t<k; t++) {
		const cType = cKeys[t], cList = clients[cType];
		for(let i=0,l=cList.length; i<l; i++) { if((!destType || cType == destType) && (cType != tp || i != ind)) {
			try { cList[i].emit('bcast', type, data, tp, ind) } catch(e) {
				const msg = "Could not forward event to client "+cType+":"+i+"!";
				if(skipCli) skipCli.cliErr(msg); else console.log(chalk.red("[SOCKET] "+msg));
			}
		}}
	}
}

function logClientList() {
	let str = ""; const cKeys = Object.keys(clients);
	for(let t=0,k=cKeys.length; t<k; t++) {
		str += (t==0?"":", ")+"'"+cKeys[t]+"':["; const cList = clients[cKeys[t]];
		for(let i=0,l=cList.length; i<l; i++) str += (i==0?"":",")+cList[i].ind;
		str += "]";
	}
	return str;
}