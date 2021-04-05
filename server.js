//Instructor Form, Copyright (©) 2021 Bryce Peterson (pecacheu@gmail.com); GNU GPL v3.0
const VERSION='v3.0.4';

'use strict';
const router=require('./router'), fs=require('fs'), https=require('https'), url=require('url'), chalk=require('chalk'), sio=require('socket.io'), mail=require('sendmail')({silent:true}), stripHtml=require('string-strip-html').stripHtml;
let Cli={}, ServerIp;

//Config Options:
const Debug=false, Port=8020, Path="/root",
ServerName="Automated Forms Server", SendTimeout=15000, ReqTimeout=5000,
SrvOpt = {key:fs.readFileSync('cert.key'), cert:fs.readFileSync('cert.crt')};

//Filter Patterns:
const pTitle=/^[\w\-:.<>()[\]&*%!, ]+$/, pText=/^[\w\+\-(). ]+$/,
pEmail=/^\w+(?:[\.+-]\w+)*@\w+(?:[\.-]\w+)*\.\w\w+$/, pDate=/^[\w,: ]+$/;

//Messages:
const MsgHeader="{ NovaLabs FormBot Automated Message }", MsgStyle='font:20px "Segoe UI",Helvetica,Arial',
NoHTML="\nHTML-enabled viewer is required for viewing this message.\n\nPowered by bTech.";

//Email Addresses:
const MailHost='formbot@nova-labs.org', AccAddr=['formbot-events-relay@nova-labs.org'],
MemAddr='formbot-membership-relay@nova-labs.org';

//Auth Keys:
const ApiKey=fs.readFileSync('apikey'), AuthUri="https://oauth.wildapricot.org/auth/token",
ApiUri="https://api.wildapricot.org/v2/accounts/"; let ATkn,AUsr,EvLoad;

//Entry Point:
exports.begin = ips => {
	console.log(chalk.yellow("Link.js Server, [FormBot "+VERSION+"]")
	+"\nType 'exit' to stop server. Type 'list' for list of clients.\n");
	ServerIp=(ips?ips[0]:'localhost'); getAuth((e) => {
		if(e) console.log(chalk.bgRed("AuthKey"),e); else init();
	});
}
function init() {
	console.log("Starting "+chalk.bgRed(ServerName)+'\n');
	if(Debug == 2) router.debug = Debug; handleInput(); startServer();
}

function getAuth(cb) {
	if(ATkn) return;
	let hdr = {
		"Content-type":"application/x-www-form-urlencoded",
		Authorization:"Basic "+Buffer.from("APIKEY:"+ApiKey).toString('base64')
	};
	httpsReq(AuthUri, 'POST', hdr, (e,d) => {
		if(!e) try {
			d=JSON.parse(d); let ex=d.expires_in;
			if(!(ATkn=d.access_token)) throw "Invalid Token";
			if(!(AUsr=d.Permissions[0].AccountId)) throw "Invalid UUID";
			console.log("Auth Token:",ATkn,"UID:",AUsr,"Exp:",ex);
			setTimeout(() => {ATkn=0;console.log("Token expired")}, ex*1000);
		} catch(e2) {e=e2} cb(e);
	}, "grant_type=client_credentials&scope=auto");
}

function getEvent(sk,ev) {
	const EV='getEvent', hd={Authorization:"Bearer "+ATkn};
	httpsReq(ApiUri+AUsr+"/events/"+ev, 'GET', hd, (e,d) => {
		if(e) return EvLoad=0,ack(sk,EV,e.toString());
		httpsReq(ApiUri+AUsr+"/eventregistrations?eventId="+ev, 'GET', hd, (e,dr) => {
			if(!e) try {
				d=JSON.parse(d), dr=JSON.parse(dr);
				let rt=d.Details.RegistrationTypes, evm={
					name:d.Name, id:d.Id, link:"https://portal.nova-labs.org/event-"+d.Id,
					ven:"Nova Labs", loc:d.Location, fRaw:0, dRaw:d.StartDate,
					yes:d.ConfirmedRegistrationsCount, wait:d.PendingRegistrationsCount,
					desc:stripHtml(d.Details.DescriptionHtml).result, hosts:[], rsvp:[]
				};
				//Fee Info:
				for(let i=0,l=rt.length; i<l; i++) evm.fRaw=Math.max(rt[i].BasePrice||0,evm.fRaw);
				evm.fee=evm.fRaw?formatCost(evm.fRaw):"Free";
				//RSVP:
				if(evm.yes != dr.length) throw "RSVP Mismatch";
				for(let i=0,l=dr.length,u; i<l; i++) {
					u=getEvUser(dr[i]); if(u.h) evm.hosts.push(u); else evm.rsvp.push(u);
				}
				evm.yes -= evm.hosts.length;
				if(!evm.hosts.length) evm.hosts.push({name:"???",email:''});
				evm.raw=[d,dr]; //<------- TEST
				console.log("Got Event "+ev); ack(sk,EV,(sk.evm=evm));
			} catch(e2) {e=e2}
			EvLoad=0; if(e) ack(sk,EV,ev+': '+e.toString());
		});
	});
}
function getEvUser(u) {
	let fn,ln,em,r=u.RegistrationFields;
	for(let i=0,l=r.length; i<l; i++) switch(r[i].SystemCode) {
		case 'FirstName': fn=r[i].Value; break; case 'LastName': ln=r[i].Value; break;
		case 'Email': em=r[i].Value; break;
	}
	if(!fn || !ln || !em) throw "User Data "+u.Id;
	return {name:fn+' '+ln, email:em, id:u.Id, fee:u.PaidSum||0,
	h:u.RegistrationType.Name.startsWith("Instructor")};
}

function httpsReq(uri, mt, hdr, cb, rb) {
	let dat='',tt,re,rq=https.request(uri, {method:mt,headers:hdr}, (r) => {
		re=r; r.setEncoding('utf8'); r.on('data', d => { dat+=d; }); r.on('end', rEnd);
	}).on('error', rEnd);
	tt=setTimeout(() => { tt=0; rEnd(Error("Timed Out")); }, ReqTimeout);
	if(rb) rq.write(rb); rq.end();
	function rEnd(e) {
		if(rq.ee) return; if(e) rq.destroy(); rq.ee=1; if(tt) clearTimeout(tt);
		if(!e && re.statusCode != 200) e=Error("Code "+re.statusCode+(dat?" "+dat:'')); cb(e,dat);
	}
}

//Allows you to quit by typing exit:
function handleInput() {
	process.stdin.resume();
	process.stdin.setEncoding('utf8');
	process.stdin.on('data', cmd => {
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

function startServer() {
	function onReq(req, resp) {
		let uri=url.parse(req.url), pn=uri.pathname;
		if(Debug) console.log("[ROUTER]",pn);
		router.handleRequest(Path,pn,resp,req);
	}
	let srv=https.createServer(SrvOpt,onReq).listen(Port, () => {
		console.log("Listening at "+chalk.bgGreen('https://'+ServerIp+':'+Port)+'\n');
	});
	initSockets(srv);
}

function initSockets(host) {
	sio(host).on('connection', sock => {
		console.log(chalk.cyan("[SOCKET] Establishing connection..."));
		//Handle premature disconnection:
		sock.on('disconnect', () => {
			sock.removeAllListeners();
			console.log(chalk.red("[SOCKET] Connection dropped!"));
		});
		//Initial connection event:
		sock.once('type', function(cType) {
			if(tyS(cType) && tyN(cType)) return console.log(chalk.red("[SOCKET] Bad response: initType"));
			this.type=cType; if(!Cli[cType]) Cli[cType]=[]; this.ind=Cli[cType].length; Cli[cType].push(this);
			console.log(chalk.yellow("[SOCKET] New client",this.handshake.address,"{type="+this.type+",id="+this.ind+"}"));

			if(Debug) console.log("clientList:",logClientList());
			this.cliLog = (clr, msg) => {console.log(chalk[clr]("[SOCKET "+this.type+":"+this.ind+"] "+msg))}
			this.cliErr = msg => {this.cliLog('red',msg)}

			this.on('bcast', (type, data, destType) => {
				if(tyS(type)) return this.cliErr("Bad response: eventType");
				if(data && tyO(data)) return this.cliErr("Bad response: eventData");
				if(destType != null && tyS(destType) && tyN(destType)) return this.cliErr("Bad response: eventDestType");
				if(Debug) this.cliLog('green', "Got "+chalk.yellow(type)+" event");
				sendToAll(type,data,this,destType); //Forward event to all other clients.
			});

			this.on('getEvent', ev => {
				const EV='getEvent';
				if(!ev || tyS(ev) || ev.length > 20) return ack(this,EV,"Invalid event '"+ev+"'");
				if(EvLoad) return ack(this,EV,"Server busy"); EvLoad=1;
				if(ATkn) getEvent(this,ev); else getAuth((e) => {
					if(e) EvLoad=0,ack(this,EV,"Auth "+e.toString()); else getEvent(this,ev);
				});
			});

			this.on('sendForm', (title, date, uName, uMail, data, aList, sType) => {
				const EV='sendForm';
				//Error Checking:
				if(tyS(title) || title.length > 80 || !pTitle.test(title)) return ack(this,EV,"Bad input: title");
				if(tyS(date) || date.length > 80 || !pDate.test(date)) return ack(this,EV,"Bad input: date");
				if(tyS(uName) || !pText.test(uName)) return ack(this,EV,"Bad input: instructorName");
				if(tyS(uMail) || !pEmail.test(uMail)) return ack(this,EV,"Bad input: instructorMail");
				if(tyS(data) || data.length < 1) return ack(this,EV,"Bad input: data");
				if(data.length > 20000) return ack(this,EV,"Data exceeded maximum length (20000)");
				if(!Array.isArray(aList) || aList.length > 200) return ack(this,EV,"Bad input: attendeeList");
				if(!(sType >= 0) || sType && !aList.length) return ack(this,EV,"Bad input: sType");
				//Attendee List Error Checking:
				for(let i=0,a,e=0,l=aList.length; i<l; i++) {
					a=aList[i]; if(a.length !== 3) e="Invalid Length";
					if(tyS(a[0]) || a[0].length > 80 || !pText.test(a[0])) e="Name Invalid";
					if(tyN(a[1]) || a[1]<0) e="ID Invalid"; if(tyS(a[2]) || a[2].length > 15) e="Price Invalid";
					if(e) return ack(this,EV,"Bad input: attendeeList["+i+"]: "+e);
				}

				this.cliLog('yellow',"("+EV+") Submitting '"+title+"'...");
				let t=setTimeout(() => { ack(this,EV,"Failed to send email: Timed out!"); }, SendTimeout);
				function cancel() { if(t) clearTimeout(t),t=0; }

				//Embedded Event:
				let sb=(uMail=='test@example.com'?"<<FORMBOT_TEST>>":"FormBot: ")+title+" on "+date, ev=genEvent(this.evm), aTab=aList.length?(sType==2?"<p style='color:#f00'><b>No NovaPass or tool sign off. Safety Sign-Off Only.</b></p>":'')+"<p>Event Attendee List:</p>"+genTable(aList):'', atp=title.indexOf('-'), atn=title.substr(0,atp==-1?title.length:atp).replace(/\s/g,'');
				if(tyS(ev)) return ack(this,EV,"Error generating event data: "+ev[0]);

				//Send Emails:
				let al=AccAddr.slice(),ok=0; al.push(uMail);
				if(sType) al.push(MemAddr);
				for(let i in al) {
					let a=al[i]; console.log("-",chalk.yellow(a));
					mail({
						from:MailHost, to:a, subject:sb, text:MsgHeader+NoHTML, html:"<body style='"+MsgStyle+"'><p><b>"+MsgHeader+"</b></p>"+ev+aTab+"<br>Formbot "+VERSION+" by <a href='https://github.com/pecacheu'>Pecacheu</a></body>", attachments:[{filename:atn+'.pdf', contentType:router.types['.pdf']||'text/plain', content:data}]
					}, (e,re) => {
						if(e && e.message != 'read ECONNRESET') {
							cancel(); ack(this,EV,"Failed to send to "+a+": "+e.message); return this.cliErr(e);
						} else if(e) this.cliErr(">>SUPPRESSED ECONNRESET<<");
						this.cliLog('yellow',a+": Email sent!"); console.log("REPLY:",re);
						if(ok >= al.length-1) { cancel(); ack(this,EV); } else ok++;
					});
				}
			});

			//Handle disconnection:
			this.removeAllListeners('disconnect');
			this.on('disconnect', function() {
				this.removeAllListeners(); this.cliErr("Client disconnected");
				if(Debug) console.log("old clientList:",logClientList()); const cList = Cli[this.type]; cList.splice(this.ind,1);
				for(let i=0,l=cList.length,ind=this.ind; i<l; i++) { let s = cList[i]; if(s.ind > ind) { s.ind--; s.emit('id', s.ind); }}
				if(Debug) console.log("new clientList:",logClientList());
			});
			this.emit('connection', this.ind, VERSION); //Emit connection event.
		}); sock.emit('type'); //Send type request.
	});
}

function tyS(v) { return typeof v != 'string'; }
function tyN(v) { return typeof v != 'number'; }
function tyO(v) { return typeof v != 'object'; }

const tStyle='overflow:hidden;max-width:1000px;color:#888;border-radius:10px;width:100%;border-collapse:collapse;background:#f5f5f5;box-shadow:2px 2px 2px rgba(0,0,0,0.3);font-size:16px;table-layout:fixed', tdStyle='border-top:1px solid #eee;padding:9px 12px;line-height:15px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden', trFirstStyle='border-top:none;background:#eee', trEvenStyle="style='background:#dcdcdc'", nameStyle='font-weight:700', mailStyle='color:#5299e2;font-weight:500', userStyle='text-align:right';

function genTable(tb) {
	let lh=''; function makeRow(a,i) {
		if(!a[2]) a[2]=''; lh += "<tr "+(i%2?'':trEvenStyle)+"><td style='"+tdStyle+';'+nameStyle+"'>"+a[0]+"</td>"+
		"<td style='"+tdStyle+';'+mailStyle+"'>"+a[1]+"</td><td style='"+tdStyle+';'+userStyle+"'>"+a[2]+"</td></tr>";
	}
	for(let i=0,l=tb.length; i<l; i++) makeRow(tb[i],i);
	return "<table style='"+tStyle+"'><tr style='"+trFirstStyle+
	"'><th style='width:40%'>Name</th><th>User ID</th><th>Payment</th></tr>"+lh+"</table>";
}

const muEvent='width:550px;overflow:hidden;font-size:16px;border-radius:8px;padding:16px;border:1px solid rgba(0,0,0,0.12);background:#fafafa;box-shadow:2px 2px 2px rgba(0,0,0,0.3); color:rgba(0,0,0,0.87)', muLink='color:inherit;display:inline-block;text-decoration:none;vertical-align:bottom;', muTitle='font-size:16pt;font-weight:600;white-space:pre-line', muDetail='margin-top:6px;width:70%;float:left', muVen='color:rgb(0,154,227)', muSub='color:rgba(0,0,0,0.54);font-size:13px', muDesc='margin-top:6px;line-height:1.35em;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;height:84px;overflow:hidden', muMeta='margin-top:8px;float:right', muRSVP='margin-top:6px;font-size:13.5px', muHosts='margin-top:6px;display:inline-block;width:100%;color:rgba(0,0,0,0.54);font-size:13px';

function genEvent(ev) {
	if(!ev) return "<p>FormBot Couldn't Find This Event.</p>";
	try { let eh=ev.hosts, hc="Hosted By: "; for(let i=0,l=eh.length; i<l; i++)
		hc += (i?', ':'')+"<a href='"+ev.link+"' target='_blank' style='"+muLink+muVen+"'>"+eh[i].name+"</a>";
	return "<p>FormBot Thinks This Event Is:</p><div style='"+muEvent+"'><a style='"+muLink+muTitle+"' href='"+ev.link+"' target='_blank'>"+ev.name+"</a><div style='"+muDetail+"'><a style='"+muLink+muVen+"' href='"+ev.link+"' target='_blank'>"+ev.ven+"</a><div style='"+muSub+"'>"+ev.loc+"</div><div style='"+muDesc+"'>"+ev.desc+"</div></div><div style='"+muMeta+"'><div style='"+muSub+';margin-bottom:6px'+"'>100% Match</div><div>"+ev.time+"</div><div style='"+muSub+"'>"+ev.date+"</div><div style='"+muRSVP+"'>"+ev.yes+" Attendees<br>"+ev.wait+" Waitlist</div><div style='margin-top:6px'>"+ev.fee+"</div></div><div style='"+muHosts+"'>"+hc+"</div></div>";
	} catch(e) { return [e.toString()]; }
}

function ack(cli, eType, stat) {
	if(tyS(stat)) { cli.cliLog('green',"ACK true"); cli.emit('ack',eType,true,stat); }
	else { cli.cliErr("("+eType+") "+stat); cli.emit('ack',eType,false,stat); }
}

//Send event to all clients:
function sendToAll(type, data, skipCli, destType) {
	const cKeys = Object.keys(Cli), tp = skipCli?skipCli.type:null, ind = skipCli?skipCli.ind:-1;
	for(let t=0,k=cKeys.length; t<k; t++) {
		const cType = cKeys[t], cList = Cli[cType];
		for(let i=0,l=cList.length; i<l; i++) { if((!destType || cType == destType) && (cType != tp || i != ind)) {
			try { cList[i].emit('bcast', type, data, tp, ind) } catch(e) {
				const msg = "Could not forward event to client "+cType+":"+i+"!";
				if(skipCli) skipCli.cliErr(msg); else console.log(chalk.red("[SOCKET] "+msg));
			}
		}}
	}
}

function logClientList() {
	let str = ""; const cKeys = Object.keys(Cli);
	for(let t=0,k=cKeys.length; t<k; t++) {
		str += (t==0?"":", ")+"'"+cKeys[t]+"':["; const cList = Cli[cKeys[t]];
		for(let i=0,l=cList.length; i<l; i++) str += (i==0?"":",")+cList[i].ind;
		str += "]";
	}
	return str;
}

function formatCost(n,sym) { //From utils.js
	if(!sym) sym = '$'; if(!n) return sym+'0.00';
	const p = n.toFixed(2).split('.');
	return sym+p[0].split('').reverse().reduce((a, n, i) =>
	{ return n=='-'?n+a:n+(i&&!(i%3)?',':'')+a; },'')+'.'+p[1];
}