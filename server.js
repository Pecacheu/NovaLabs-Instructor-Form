//Instructor Form ©2021 Pecacheu. GNU GPL v3.0
const VERSION='v3.2.3';

import router from './router.js'; import fs from 'fs'; import http from 'http'; import https from 'https';
import chalk from 'chalk'; import {Server as io} from 'socket.io'; import * as mail from 'nodemailer';
import {stripHtml} from 'string-strip-html'; import argon2 from 'argon2';
let Cli={}, SrvIp, Mailer;

//Config Options:
const Debug=false, Port=443, Path="/root", SendTimeout=15000, ReqTimeout=5000,
PwdHash='$argon2i$v=19$m=4096,t=3,p=1$YnpaQ016UjBVMWd4VFVoUlowWk1XQQ$offATn+U1wQRYxzayD2o28iyH0GXbMuCoQLB6nuuMZY',
SrvKey='../snap/keys/privkey.pem', SrvCert='../snap/keys/fullchain.pem';

//Filter Patterns:
const pTitle=/^[\w\-:.<>()[\]&*%!', ]+$/, pText=/^[\w\+\-()'. ]+$/,
pEmail=/^\w+(?:[\.+-]\w+)*@\w+(?:[\.-]\w+)*\.\w\w+$/, pDate=/^[\w,: ]+$/;

//Messages:
const MsgHeader="{ NovaLabs FormBot Automated Message }", MsgStyle='font:20px "Segoe UI",Helvetica,Arial',
NoHTML="\nHTML-enabled viewer is required for viewing this message.\n\nPowered by bTech.";

//Email Addresses:
const MailPass=fs.readFileSync('mailpass'), MailHost='formbot@nova-labs.org',
AccAddr=['formbot-events-relay@nova-labs.org'], MemAddr='formbot-membership-relay@nova-labs.org';

//Auth Keys:
const ApiKey=fs.readFileSync('apikey'), AuthUri="https://oauth.wildapricot.org/auth/token",
ApiUri="https://api.wildapricot.org/v2/accounts/"; let ATkn,AUsr,EvLoad,SrvOpt;

try {SrvOpt={key:fs.readFileSync(SrvKey), cert:fs.readFileSync(SrvCert)}}
catch(e) {console.log(chalk.dim("Warning: Could not load certificates! HTTPS disabled"))}

export function begin(ips) {
	console.log(chalk.yellow("FormBot "+VERSION));
	SrvIp=(ips?ips[0]:'localhost'); if(Debug == 2) router.debug=Debug;
	getAuth().then(initMail).catch(e => console.log(chalk.bgRed("AuthKey"),e));
}

async function getAuth() {
	if(ATkn) return;
	let hdr = {
		"Content-type":"application/x-www-form-urlencoded",
		Authorization:"Basic "+Buffer.from("APIKEY:"+ApiKey).toString('base64')
	},
	d=JSON.parse(await httpsReq(AuthUri, 'POST', hdr, "grant_type=client_credentials&scope=auto")),
	ex=d.expires_in;
	if(!(ATkn=d.access_token)) throw "Invalid Token";
	if(!(AUsr=d.Permissions[0].AccountId)) throw "Invalid UUID";
	console.log("Auth Token:",ATkn,"UID:",AUsr,"Exp:",ex);
	setTimeout(() => {ATkn=0;console.log("Token expired")}, ex*1000);
}

function initMail() {
	Mailer=mail.createTransport({
		host:"smtp.gmail.com", port:587, requireTLS:true, auth:{user:MailHost, pass:MailPass}
	});
	Mailer.verify((e) => {
		if(e) { console.log(chalk.bgRed("SMTP Init"),e); return process.exit(); }
		console.log("SMTP connected!"); startServer(); runInput();
	});
}

function getEvent(sk,ev) {
	const EV='getEvent';
	getEvData(ev).then(evm => {
		console.log("Got Event",ev);
		EvLoad=0; ack(sk,EV,(sk.evm=evm));
	}).catch(e => {
		EvLoad=0; ack(sk,EV,ev+": "+e);
	});
}
async function getEvData(ev) {
	const hd={Authorization:"Bearer "+ATkn};
	let d=await httpsReq(ApiUri+AUsr+"/events/"+ev, 'GET', hd),
	dr=await httpsReq(ApiUri+AUsr+"/eventregistrations?eventId="+ev, 'GET', hd);
	//Parse:
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
	for(let i=0,l=dr.length,u; i<l; i++) {
		try { u=await getEvUser(dr[i],hd); } catch(e) { throw "User["+i+"] "+e; }
		if(u.h) evm.hosts.push(u); else evm.rsvp.push(u);
	}
	evm.yes -= evm.hosts.length;
	if(!evm.hosts.length) evm.hosts.push({name:"???",email:''});
	if(Debug) evm.raw=[d,dr];
	return evm;
}
async function getEvUser(u,hd) {
	let fn,ln,em,r=u.RegistrationFields,t=u.RegistrationType;
	for(let i=0,l=r.length; i<l; i++) switch(r[i].SystemCode) {
		case 'FirstName': fn=r[i].Value; break; case 'LastName': ln=r[i].Value; break;
		case 'Email': em=r[i].Value; break;
	}
	if(!fn || !ln || !em || !t || !t.Name || !u.Contact) throw "Data Error";
	//Get Member Level:
	let c=JSON.parse(await httpsReq(ApiUri+AUsr+"/contacts/"+u.Contact.Id, 'GET', hd));
	return {name:fn+' '+ln, email:em, id:u.Contact.Id, fee:u.PaidSum||0,
	level:c.MembershipLevel?c.MembershipLevel.Name:null, h:t.Name.startsWith("Instructor")};
}

function httpsReq(uri, mt, hdr, rb) {
	return new Promise((res,rej) => {
		let dat='',tt,re,rq=https.request(uri, {method:mt,headers:hdr}, (r) => {
			re=r; r.setEncoding('utf8'); r.on('data', d => { dat+=d; }); r.on('end', rEnd);
		}).on('error', rEnd);
		if(rb) rq.write(rb); rq.end();
		tt=setTimeout(() => rEnd(Error("Timed Out")), ReqTimeout);
		function rEnd(e) {
			if(rq.ee) return; if(e) rq.destroy(); rq.ee=1; clearTimeout(tt);
			if(!e && re.statusCode != 200) rej(Error("Code "+re.statusCode+(dat?" "+dat:'')+" "+uri));
			else res(dat);
		}
	});
}

function startServer() {
	function onReq(req, res) {
		if(Debug) console.log("[ROUTER]",req.url);
		router.handle(Path,res,req);
	}
	let srv=(SrvOpt?https.createServer(SrvOpt,onReq):http.createServer(onReq)).listen(Port, () => {
		console.log(`Listening at ${chalk.bgGreen(`http${SrvOpt?'s':''}://${SrvIp}:${Port}`)}\n`);
	});
	//Init Socket.io
	new io(srv).on('connection', sck => {
		sck.adr=sck.handshake.address.substr(7);
		console.log(chalk.cyan("[SCK] Establishing connection..."));
		sck.on('disconnect', () => {
			sck.removeAllListeners();
			console.log(chalk.red("[SCK] Connection dropped!"));
		});
		function badPwd(p,e) {
			console.log(chalk.red("[SCK] Bad passwd"),sck.adr,`'${p}'`,e||'');
			return setTimeout(() => sck.emit('badPwd'), 1000);
		}
		sck.once('type', (cType, pwd) => {
			if(tyS(cType)) return console.log(chalk.red("[SCK] Bad cType"),sck.adr);
			sck.type=cType; argon2.verify(PwdHash,pwd).then((v) => {
				if(v) initCli(sck); else badPwd(pwd);
			}).catch((e) => {badPwd(pwd,e)});
		});
		sck.emit('type'); //Request type
	});
}

function initCli(sck) {
	let CT=Cli[sck.type]; if(!CT) CT=Cli[sck.type]=[]; sck.ind=CT.length; CT.push(sck);
	console.log(chalk.yellow("[SCK] New client",sck.adr,`{type=${sck.type},id=${sck.ind}}`));

	if(Debug) console.log("clientList:",logClientList());
	sck.cliLog = (clr, msg) => {console.log(chalk[clr](`[${sck.type}:${sck.ind}] `+msg))}
	sck.cliErr = msg => {sck.cliLog('red',msg)}

	sck.on('getEvent', ev => {
		const EV='getEvent';
		if(!ev || tyS(ev) || ev.length > 20) return ack(sck,EV,"Invalid event "+ev);
		if(EvLoad) return ack(sck,EV,"Server busy"); EvLoad=1;
		if(ATkn) getEvent(sck,ev); else getAuth().then(() => getEvent(sck,ev))
		.catch(e => { EvLoad=0,ack(sck,EV,"Auth "+e); });
	});

	sck.on('sendForm', (title, date, uName, uMail, pdf, aList, sType) => {
		const EV='sendForm';
		//Error Checking:
		if(tyS(title) || title.length > 80 || !pTitle.test(title)) return ack(sck,EV,"Bad input: title");
		if(title.indexOf(':') == -1 || Number(title)) return ack(sck,EV,"Invalid title! Did you mean to auto-fill via class ID? To auto-fill, please select the name field again and press ENTER or ⏎");
		if(tyS(date) || date.length > 80 || !pDate.test(date)) return ack(sck,EV,"Bad input: date");
		if(tyS(uName) || !pText.test(uName)) return ack(sck,EV,"Bad input: instructorName");
		if(tyS(uMail) || !pEmail.test(uMail)) return ack(sck,EV,"Bad input: instructorMail");
		if(tyS(pdf) || pdf.length < 1) return ack(sck,EV,"Bad input: pdf");
		if(pdf.length > 20000) return ack(sck,EV,"Pdf exceeded max size 20KB");
		if(!Array.isArray(aList) || aList.length > 200) return ack(sck,EV,"Bad input: attendeeList");
		if(!(sType >= 0) || sType && !aList.length) return ack(sck,EV,"Bad input: sType");
		//Attendee List Error Checking:
		for(let i=0,a,e=0,l=aList.length; i<l; i++) {
			a=aList[i]; if(a.length !== 3) e="Invalid Length";
			if(tyS(a[0]) || a[0].length > 80 || !pText.test(a[0])) e="Name Invalid";
			if(tyS(a[1]) || a[1].length > 40) e="Level Invalid";
			if(tyS(a[2]) || a[2].length > 15) e="Price Invalid";
			if(e) return ack(sck,EV,"Bad input: attendeeList["+i+"]: "+e);
		}

		sck.cliLog('yellow',`(${EV}) Submitting '${title}'...`);
		let t=setTimeout(() => { ack(sck,EV,"Failed to send email: Timed out!"); }, SendTimeout);
		function tStop() { if(t) clearTimeout(t),t=0; }

		//Embedded Event:
		let sb=(uMail=='test@example.com'?"<<FORMBOT_TEST>>":"FormBot: ")+title+" on "+date, ev=genEvent(sck.evm), aTab=aList.length?(sType==2?"<p style='color:#f00'><b>No NovaPass or tool sign off. Safety Sign-Off Only.</b></p>":'')+"<p>Event Attendee List:</p>"+genTable(aList):'', atp=title.indexOf('-'), atn=title.substr(0,atp==-1?title.length:atp).replace(/\s/g,'');
		if(tyS(ev)) return ack(sck,EV,"Error generating event data: "+ev[0]);

		//Send Emails:
		let al=AccAddr.slice(),ok=0; al.push(uMail);
		if(sType) al.push(MemAddr);
		for(let i in al) {
			let a=al[i]; console.log("-",chalk.yellow(a));
			Mailer.sendMail({
				from:MailHost, to:a, subject:sb, text:MsgHeader+NoHTML, html:`<body style='${MsgStyle}'><p><b>${MsgHeader}</b></p>${ev+aTab}<br>Formbot ${VERSION} by <a href='https://github.com/pecacheu'>Pecacheu</a></body>`, attachments:[{filename:atn+'.pdf', contentType:router.types['.pdf'], content:pdf}]
			}, (e,r) => {
				if(e) { tStop(); return ack(sck,EV,`Failed to send to ${a}: `+e); }
				sck.cliLog('yellow',a+": Email sent!"); console.log("REPLY:",r.response);
				if(ok >= al.length-1) { tStop(); ack(sck,EV); } else ok++;
			});
		}
	});

	//Handle disconnection:
	sck.removeAllListeners('disconnect');
	sck.on('disconnect', function() {
		sck.removeAllListeners(); sck.cliErr("Client disconnected"); CT.splice(sck.ind,1);
		for(let i=0,l=CT.length,ind=sck.ind; i<l; i++) { let s=CT[i]; if(s.ind > ind) s.emit('id',s.ind--); }
	});
	sck.emit('connection', sck.ind, VERSION);
}

function tyS(v) { return typeof v != 'string'; }

const tStyle='overflow:hidden;max-width:1000px;color:#888;border-radius:10px;width:100%;border-collapse:collapse;background:#f5f5f5;box-shadow:2px 2px 2px rgba(0,0,0,0.3);font-size:16px;table-layout:fixed', tdStyle='border-top:1px solid #eee;padding:9px 12px;line-height:15px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden', trFirstStyle='border-top:none;background:#eee', trEvenStyle="style='background:#dcdcdc'", nameStyle='font-weight:700', mailStyle='color:#5299e2;font-weight:500', userStyle='text-align:right';

function genTable(tb) {
	let lh=''; function makeRow(a,i) {
		if(!a[2]) a[2]=''; lh += "<tr "+(i%2?'':trEvenStyle)+"><td style='"+tdStyle+';'+nameStyle+"'>"+a[0]+"</td>"+
		"<td style='"+tdStyle+';'+mailStyle+"'>"+a[1]+"</td><td style='"+tdStyle+';'+userStyle+"'>"+a[2]+"</td></tr>";
	}
	for(let i=0,l=tb.length; i<l; i++) makeRow(tb[i],i);
	return "<table style='"+tStyle+"'><tr style='"+trFirstStyle+
	"'><th style='width:40%'>Name</th><th>Member Level</th><th>Payment</th></tr>"+lh+"</table>";
}

const muEvent='width:550px;overflow:hidden;font-size:16px;border-radius:8px;padding:16px;border:1px solid rgba(0,0,0,0.12);background:#fafafa;box-shadow:2px 2px 2px rgba(0,0,0,0.3); color:rgba(0,0,0,0.87)', muLink='color:inherit;display:inline-block;text-decoration:none;vertical-align:bottom;', muTitle='font-size:16pt;font-weight:600;white-space:pre-line', muDetail='margin-top:6px;width:70%;float:left', muVen='color:rgb(0,154,227)', muSub='color:rgba(0,0,0,0.54);font-size:13px', muDesc='margin-top:6px;line-height:1.35em;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;height:84px;overflow:hidden', muMeta='margin-top:8px;float:right', muRSVP='margin-top:6px;font-size:13.5px', muHosts='margin-top:6px;display:inline-block;width:100%;color:rgba(0,0,0,0.54);font-size:13px';

function genEvent(ev) {
	if(!ev) return "<p>FormBot Couldn't Find This Event.</p>";
	try { let eh=ev.hosts, hc="Hosted By: "; for(let i=0,l=eh.length; i<l; i++)
		hc+=(i?', ':'')+`<a href='${ev.link}' target='_blank' style='${muLink+muVen}'>${eh[i].name}</a>`;
	return `<p>FormBot Thinks This Event Is:</p><div style='${muEvent}'><a style='${muLink+muTitle}' href='${ev.link}' target='_blank'>${ev.name}</a><div style='${muDetail}'><a style='${muLink+muVen}' href='${ev.link}' target='_blank'>${ev.ven}</a><div style='${muSub}'>${ev.loc}</div><div style='${muDesc}'>${ev.desc}</div></div><div style='${muMeta}'><div style='${muSub+';margin-bottom:6px'}'>100% Match</div><div>${ev.time}</div><div style='${muSub}'>${ev.date}</div><div style='${muRSVP}'>${ev.yes} Attendees<br>${ev.wait} Waitlist</div><div style='margin-top:6px'>${ev.fee}</div></div><div style='${muHosts}'>${hc}</div></div>`;
	} catch(e) { return [e.toString()]; }
}

function ack(cli, eType, stat) {
	if(tyS(stat)) { cli.cliLog('green',"ACK true"); cli.emit('ack',eType,true,stat); }
	else { cli.cliErr(`(${eType}) `+stat); cli.emit('ack',eType,false,stat); }
}

function logClientList() {
	let ck=Object.keys(Cli), s="";
	for(let t=0,k=ck.length,cl; t<k; t++) {
		s += (t==0?"":", ")+`'${ck[t]}':[`; cl=Cli[ck[t]];
		for(let i=0,l=cl.length; i<l; i++) s += (i==0?"":",")+cl[i].adr;
		s += "]";
	}
	return s;
}

function formatCost(n,sym) { //From utils.js
	if(!sym) sym = '$'; if(!n) return sym+'0.00';
	const p = n.toFixed(2).split('.');
	return sym+p[0].split('').reverse().reduce((a, n, i) =>
	{ return n=='-'?n+a:n+(i&&!(i%3)?',':'')+a; },'')+'.'+p[1];
}

function runInput() {
	console.log("Type 'list' to list clients. Type 'q' to quit.");
	process.stdin.resume(); process.stdin.setEncoding('utf8');
	process.stdin.on('data', cmd => {
		for(let s; (s=cmd.search(/[\n\r]/)) != -1;) cmd=cmd.substring(0,s);
		if(cmd == 'exit' || cmd == 'q') {
			console.log(chalk.magenta("Exiting...")); process.exit();
		} else if(cmd == 'list') {
			console.log("clientList:",chalk.yellow(logClientList()));
		}
	});
}