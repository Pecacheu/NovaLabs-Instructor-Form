//Instructor Form, Pecacheu 2026. GNU GPL v3
const VER='v3.4.0';

import fs from 'fs';
import path from 'path';
import http from 'http';
import https from 'https';
import C from 'chalk';
import {Server as io} from 'socket.io';
import * as mail from 'nodemailer';
import {stripHtml} from 'string-strip-html';
import {OTP} from 'otplib';
import router from 'raiutils/router';
import schema from 'raiutils/schema';
import 'raiutils';
let Cli={}, SrvIp, Mailer;

//Config Options
const Debug=0, Port=8080, SendTimeout=15000, ReqTimeout=5000,
App=import.meta.dirname, Web=path.join(App, "root"),
VDir={'utils.js': path.join(App, "node_modules/raiutils/utils.min.js")},
Conf=JSON.parse(fs.readFileSync('config.json')),
Otp=new OTP(),

//Filter Patterns
pTitle=/^[\w\-:.<>()[\]&*%!', ]+$/, pText=/^[\w\+\-()'. ]+$/,
pEmail=/^\w+(?:[\.+-]\w+)*@\w+(?:[\.-]\w+)*\.\w\w+$/, pDate=/^[\w,: ]+$/,

//Schemas
rDatatFmt={t:'list',min:0,f:{
	name:{t:'str',max:200},
	type:{t:'str',max:50},
	data:{t:'obj',c:Buffer}
}},

//Messages
MsgHeader="{ NovaLabs Formbot Automated Message }", MsgStyle='font:20px "Segoe UI",Helvetica,Arial',
NoHTML="\nHTML-enabled viewer is required for viewing this message.\n\nPowered by bTech.",

//Email Addresses
MailHost='formbot@nova-labs.org',
AccAddr=['formbot-events-relay@nova-labs.org'],
MemAddr='formbot-membership-relay@nova-labs.org',

//Auth Keys
AuthUri="https://oauth.wildapricot.org/auth/token",
ApiUri="https://api.wildapricot.org/v2/accounts/";
let ATkn,AUsr,EvLoad,SrvOpt;

try {SrvOpt={key:fs.readFileSync(Conf.key), cert:fs.readFileSync(Conf.cert)}}
catch(e) {console.log(C.dim("Warning: Could not load certificates! HTTPS disabled"))}

async function begin() {
	await utils.waitInit();
	const ips=utils.getIPs(), [sysOS, arch, cpu]=utils.getOS();
	console.log("IP:",ips,`OS: ${sysOS}, ${arch}\nCPU: ${cpu}\n\n`+C.yellow(`FormBot ${VER}`));
	SrvIp=(ips?ips[0]:'localhost'); if(Debug>1) router.debug=1;
	getAuth().then(initMail).catch(e => console.log(C.bgRed("AuthKey"),e));
}

async function getAuth() {
	if(ATkn) return;
	let hdr = {
		"Content-type":"application/x-www-form-urlencoded",
		Authorization:"Basic "+Buffer.from("APIKEY:"+Conf.apikey).toString('base64')
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
		host:"smtp.gmail.com", port:587, requireTLS:true, auth:{user:MailHost, pass:Conf.mailpass}
	});
	Mailer.verify((e) => {
		if(e) {console.log(C.bgRed("SMTP Init"),e); return process.exit()}
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
	//Date & Time:
	let dt=formatDate(new Date(evm.dRaw)), ds=dt.indexOf(' ',6);
	evm.time=dt.substr(0,ds), evm.date=dt.substr(ds+1);
	//Fee Info:
	for(let i=0,l=rt.length; i<l; i++) evm.fRaw=Math.max(rt[i].BasePrice||0,evm.fRaw);
	evm.fee=evm.fRaw?formatCost(evm.fRaw):"Free";
	//RSVP:
	for(let i=0,l=dr.length,u; i<l; i++) {
		try {u=await getEvUser(dr[i],hd)} catch(e) {throw "User["+i+"] "+e}
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
		case 'FirstName': fn=r[i].Value; break;
		case 'LastName': ln=r[i].Value; break;
		case 'Email': em=r[i].Value;
	}
	if((!fn && !ln) || !em || !t || !t.Name || !u.Contact) throw "Data Error";
	//Get Member Level
	let c=JSON.parse(await httpsReq(ApiUri+AUsr+"/contacts/"+u.Contact.Id, 'GET', hd));
	return {name:(fn||'')+(fn&&ln?' ':'')+(ln||''), email:em, id:u.Contact.Id, fee:u.PaidSum||0,
		level:c.MembershipLevel?c.MembershipLevel.Name:null,
		h:t.Name.toLowerCase().startsWith("5. instructor")};
}

function httpsReq(uri, mt, hdr, rb) {
	return new Promise((res,rej) => {
		let dat='',tt,re,rq=https.request(uri, {method:mt,headers:hdr}, (r) => {
			re=r; r.setEncoding('utf8'); r.on('data', d => {dat+=d}); r.on('end', rEnd);
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
		router.handle(Web,req,res,VDir);
	}
	let srv=(SrvOpt?https.createServer(SrvOpt,onReq):http.createServer(onReq)).listen(Port, () => {
		console.log(`Listening at ${C.bgGreen(`http${SrvOpt?'s':''}://${SrvIp}:${Port}`)}\n`);
	});
	//Init Socket.io
	new io(srv).on('connection', sck => {
		sck.adr=sck.handshake.address.substr(7); //TODO Always blank
		console.log(C.cyan("[SCK] Connecting..."));
		sck.on('disconnect', () => {
			sck.removeAllListeners();
			console.log(C.red("[SCK] Connection dropped!"));
		});
		function badTkn(p) {
			console.log(C.red("[SCK] Bad token"),sck.adr,`'${p}'`);
			return setTimeout(() => sck.emit('badTkn'), 1000);
		}
		sck.once('type', async (cType, tkn) => {
			if(tyS(cType)) return console.log(C.red("[SCK] Bad cType"),sck.adr);
			sck.type = cType;
			sck.cliLog = (clr, msg) => {console.log(C[clr](`[${sck.type}:${sck.ind}] `+msg))}
			sck.cliErr = msg => {sck.cliLog('red',msg)}
			let v; try {v=await Otp.verify({token:tkn, secret:Conf.otpkey})} catch(e) {sck.cliErr(e)}
			if(v && v.valid) initCli(sck,tkn); else badTkn(tkn);
		});
		sck.emit('type'); //Request type
	});
}

function initCli(sck,tkn) {
	let CT=Cli[sck.type]; if(!CT) CT=Cli[sck.type]=[]; sck.ind=CT.length; CT.push(sck);
	console.log(C.yellow("[SCK] New client",sck.adr,tkn,`{type=${sck.type},id=${sck.ind}}`));
	if(Debug) console.log("clientList:",logClientList());

	sck.on('getEvent', ev => {
		const EV='getEvent';
		if(!ev || tyS(ev) || ev.length > 20) return ack(sck,EV,"Invalid event "+ev);
		if(EvLoad) return ack(sck,EV,"Server busy"); EvLoad=1;
		if(ATkn) getEvent(sck,ev); else getAuth().then(() => getEvent(sck,ev))
		.catch(e => {EvLoad=0,ack(sck,EV,"Auth "+e)});
	});

	sck.on('sendForm', (title, date, uName, uMail, cMat, pdf, rData, aList, sType) => {
		const EV='sendForm';
		//Error Checking:
		if(tyS(title) || title.length > 120 || !pTitle.test(title)) return ack(sck,EV,"Bad input: title");
		if(title.indexOf(':') == -1 || Number(title)) return ack(sck,EV,"Invalid title! Did you mean to auto-fill via class ID? To auto-fill, please select the name field again and press ENTER or ⏎");
		if(tyS(date) || date.length > 80 || !pDate.test(date)) return ack(sck,EV,"Bad input: date");
		if(tyS(uName) || !pText.test(uName)) return ack(sck,EV,"Bad input: instructorName");
		if(tyS(uMail) || !pEmail.test(uMail)) return ack(sck,EV,"Bad input: instructorMail");
		if(tyN(cMat) || cMat < 0) return ack(sck,EV,"Bad input: materialCost");
		if(tyS(pdf) || pdf.length < 1) return ack(sck,EV,"Bad input: pdf");
		try {schema.checkType(rData, rDatatFmt)} catch(e) {return ack(sck,EV,"ReceiptList "+e)}
		if(cMat && !rData.length) return ack(sck,EV,"Receipts required if materialCost > $0");
		if(pdf.length > 20000) return ack(sck,EV,"Pdf exceeded max size 20KB");
		if(!Array.isArray(aList) || aList.length > 200) return ack(sck,EV,"Bad input: attendeeList");
		if(!(sType >= 0) || sType && !aList.length) return ack(sck,EV,"Bad input: sType");
		//Attendee List Error Checking:
		for(let i=0,a,e=0,l=aList.length; i<l; i++) {
			a=aList[i]; if(a.length !== 4) e="Invalid Length";
			a.splice(0,2,a[0]+a[1]);
			if(tyS(a[0]) || a[0].length > 80 || !pText.test(a[0])) e="Name Invalid";
			if(tyS(a[1]) || a[1].length > 40) e="Level Invalid";
			if(tyS(a[2]) || a[2].length > 15) e="Price Invalid";
			if(e) return ack(sck,EV,"Bad input: attendeeList["+i+"]: "+e);
		}

		sck.cliLog('yellow',`(${EV}) Submitting '${title}'...`);
		let t=setTimeout(() => ack(sck,EV,"Failed to send email: Timed out!"), SendTimeout);
		function tStop() {if(t) clearTimeout(t),t=0}

		//Embedded Event
		let ev = genEvent(sck.evm,uName);
		if(tyS(ev)) return ack(sck,EV,"Error generating event data: "+ev[0]);

		let sb = (uMail=='test@example.com'?"<<FORMBOT_TEST>>":"FormBot: ")+title+" on "+date,
		aTab = aList.length?(sType==2?"<p style='color:#f00'><b>No NovaPass or tool sign off. Safety Sign-Off Only.</b></p>":'')+(cMat?"Materials: "+formatCost(cMat):'')+"<p>Event Attendee List:</p>"+genTable(aList):'',
		atp = title.indexOf('-'),
		atList = [{filename:title.substr(0,atp==-1?title.length:atp).replace(/\s/g,'')+'.pdf', contentType:router.types['.pdf'], content:pdf}];

		//Receipts
		for(let r of rData) atList.push({filename:r.name, contentType:r.type, content:r.data});

		//Send Emails
		let al=AccAddr.slice(),ok=0; al.push(uMail);
		if(sType) al.push(MemAddr);
		for(let i in al) {
			let a=al[i]; console.log("-",C.yellow(a));
			Mailer.sendMail({
				from:MailHost, to:a, subject:sb, text:MsgHeader+NoHTML, html:`<body style='${MsgStyle}'><p><b>${MsgHeader}</b></p>${ev+aTab}<br>Formbot ${VER} by <a href='https://github.com/pecacheu'>Pecacheu</a></body>`, attachments:atList
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
		for(let i=0,l=CT.length,ind=sck.ind; i<l; i++) {let s=CT[i]; if(s.ind > ind) s.emit('id',s.ind--)}
	});
	sck.emit('connection', sck.ind, VER);
}

function tyS(v) {return typeof v != 'string'}
function tyN(v) {return typeof v != 'number'}

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

function genEvent(ev, host) {
	if(!ev) return "<p>FormBot Couldn't Find This Event.</p>";
	try {
		let eh=ev.hosts, hc="", chgHost=1;
		for(let i=0,l=eh.length,n; i<l; i++) {
			n=eh[i].name;
			hc+=(i?', ':'')+`<a href='${ev.link}' target='_blank' style='${muLink+muVen}'>${n}</a>`;
			if(host == n) chgHost=0;
		}
		if(host && chgHost) hc=host+` (Originally ${hc})`;
		return `<p>Formbot thinks this event is:</p><div style='${muEvent}'><a style='${muLink+muTitle}' href='${ev.link}' target='_blank'>${ev.name}</a><div style='${muDetail}'><a style='${muLink+muVen}' href='${ev.link}' target='_blank'>${ev.ven}</a><div style='${muSub}'>${ev.loc}</div><div style='${muDesc}'>${ev.desc}</div></div><div style='${muMeta}'><div style='${muSub+';margin-bottom:6px'}'>100% Match</div><div>${ev.time}</div><div style='${muSub}'>${ev.date}</div><div style='${muRSVP}'>${ev.yes} Attendees<br>${ev.wait} Waitlist</div><div style='margin-top:6px'>${ev.fee}</div></div><div style='${muHosts}'>Hosted By: ${hc}</div></div>`;
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

function runInput() {
	console.log("Type 'list' to list clients. Type 'q' to quit.");
	process.stdin.resume(); process.stdin.setEncoding('utf8');
	process.stdin.on('data', cmd => {
		for(let s; (s=cmd.search(/[\n\r]/)) != -1;) cmd=cmd.substring(0,s);
		if(cmd == 'exit' || cmd == 'q') {
			console.log(C.magenta("Exiting...")); process.exit();
		} else if(cmd == 'list') {
			console.log("clientList:",C.yellow(logClientList()));
		}
	});
}

//From utils.js
function formatCost(n,sym) {
	if(!sym) sym = '$'; if(!n) return sym+'0.00';
	const p = n.toFixed(2).split('.');
	return sym+p[0].split('').reverse().reduce((a, n, i) =>
	{ return n=='-'?n+a:n+(i&&!(i%3)?',':'')+a; },'')+'.'+p[1];
}
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fixedNum2(num) { if(num <= 9) return '0'+num; return num; }
function suffix(n) {
	let j=n%10, k=n%100;
	if(j==1 && k!=11) return n+"st";
	if(j==2 && k!=12) return n+"nd";
	if(j==3 && k!=13) return n+"rd";
	return n+"th";
}
function formatDate(d) {
	if(d == null || !d.getDate || !d.getFullYear()) return "Invalid Date";
	const mins=d.getMinutes(), month=d.getMonth(), day=d.getDate(), year=d.getFullYear();
	let hour=d.getHours(), pm=false; if(hour >= 12) { pm = true; hour -= 12; } if(hour == 0) hour = 12;
	return hour+':'+fixedNum2(mins)+' '+(pm?'PM':'AM')+' '+months[month]+' '+suffix(day)+', '+year;
}

await begin();