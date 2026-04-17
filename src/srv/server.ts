//Instructor Form, Pecacheu 2026. GNU GPL v3
const VER='v3.5.0';

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
EvMaxReq=10,
IDTimeout=4*3600000, //4 Hours
MaxUpload=1e9, //1GB
App=import.meta.dirname, Web=path.join(App, "root"),
VDir={'utils.js': path.join(App, "node_modules/raiutils/utils.min.js")},
Conf=JSON.parse(fs.readFileSync(path.join(App, 'config.json'))),
Otp=new OTP(),

//Filter Patterns
pTitle=/^[\w\-:.<>()[\]&*%!', ]+$/, pText=/^[\w\+\-()'. ]+$/,
pEmail=/^\w+(?:[\.+-]\w+)*@\w+(?:[\.-]\w+)*\.\w\w+$/, pDate=/^[\w,: ]+$/,

//Schemas
RHdrFmt={t:'list',f:{
	n:{t:'str',max:200},
	t:{t:'str',max:50},
	l:{t:'int',min:1}
}},
LogDateFmt={suf:false, year:false, df:true},

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
	if(ATkn instanceof Promise) return ATkn; //Await fetch
	if(ATkn) return; //Token exists
	return ATkn=_getAuth();
}
async function _getAuth() {
	try {
		let hdr = {
			"Content-type":"application/x-www-form-urlencoded",
			Authorization:"Basic "+Buffer.from("APIKEY:"+Conf.apikey).toString('base64')
		}, d=JSON.parse(await httpsReq(AuthUri, 'POST', hdr, "grant_type=client_credentials&scope=auto")),
		ex=d.expires_in;
		if(!(ATkn=d.access_token)) throw "Invalid Token";
		if(!(AUsr=d.Permissions[0].AccountId)) throw "Invalid UUID";
		log("Auth Token:", ATkn, "UID:", AUsr, "Exp:", ex);
		setTimeout(() => {ATkn=0; log(C.dim("Token expired"))}, ex*1000);
	} catch(e) {
		ATkn=0; throw e;
	}
}

function initMail() {
	Mailer=mail.createTransport({
		host:"smtp.gmail.com", port:587, requireTLS:true, auth:{user:MailHost, pass:Conf.mailpass}
	});
	Mailer.verify((e) => {
		if(e) {log(C.bgRed("SMTP Init"),e); return process.exit()}
		log("SMTP connected!"); startServer(); runInput();
	});
}

async function getEvent(sck, ev) {
	if(EvLoad >= EvMaxReq) throw "Server busy";
	const EV='getEvent';
	++EvLoad;
	try {
		if(!ev || tyS(ev) || ev.length > 20) throw "Invalid event";
		await getAuth();
		sck.evm = await getEvData(ev);
		log("Got Event", ev);
		ack(sck, EV, sck.evm);
	} catch(e) {
		ack(sck, EV, e, e);
	} finally {
		--EvLoad;
	}
}
async function getEvData(ev) {
	const hd={Authorization:"Bearer "+ATkn};
	let d=await httpsReq(ApiUri+AUsr+"/events/"+ev, 'GET', hd),
	dr=await httpsReq(ApiUri+AUsr+"/eventregistrations?eventId="+ev, 'GET', hd);
	//Parse
	d=JSON.parse(d), dr=JSON.parse(dr);
	let rt=d.Details.RegistrationTypes, evm={
		name:d.Name, id:d.Id, link:"https://portal.nova-labs.org/event-"+d.Id,
		ven:"Nova Labs", loc:d.Location, fRaw:0, dRaw:d.StartDate,
		yes:d.ConfirmedRegistrationsCount, wait:d.PendingRegistrationsCount,
		desc:stripHtml(d.Details.DescriptionHtml).result, hosts:[], rsvp:[]
	};
	//Date & Time
	let dt=utils.formatDate(new Date(evm.dRaw)), ds=dt.indexOf(' ',6);
	evm.time=dt.slice(0,ds), evm.date=dt.slice(ds+1);
	//Fee Info
	for(let r of rt) evm.fRaw = Math.max(r.BasePrice||0, evm.fRaw);
	evm.fee=evm.fRaw?utils.formatCost(evm.fRaw):"Free";
	//RSVP
	for(let i=0,l=dr.length,u; i<l; ++i) {
		try {u=await getEvUser(u=dr[i],hd)} catch(e) {
			throw `User[${u&&u.RegistrationType ? u.RegistrationType.Name : i}] ${e}`;
		}
		if(u.h) evm.hosts.push(u); else evm.rsvp.push(u);
	}
	evm.yes -= evm.hosts.length;
	if(!evm.hosts.length) evm.hosts.push({name:"???",email:''});
	if(Debug) evm.raw=[d,dr];
	return evm;
}
async function getEvUser(u,hd) {
	let fn,ln,em,r=u.RegistrationFields,t=u.RegistrationType;
	for(let u of r) switch(u.SystemCode) {
		case 'FirstName': fn=u.Value; break;
		case 'LastName': ln=u.Value; break;
		case 'Email': em=u.Value;
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
		if(Debug) log("[ROUTER]", req.url);
		if(req.method === 'POST' && req.url.startsWith('/upload?')) {
			//ID check
			const sck = Cli[utils.fromQuery(req.url.slice(8)).id];
			if(!sck) return httpErr(0, res, 401, "Bad ID");
			delete sck.rData;
			//Read data
			let buf;
			req.on('data', b => {
				if((buf?buf.length:0)+b.length > MaxUpload) {
					req.removeAllListeners();
					return httpErr(sck, res, 413, "File(s) too large");
				}
				buf = buf?Buffer.concat([buf,b]):b;
			});
			req.on('end', () => {try {
				//Parse header
				if(!buf) throw "No data";
				let ofs = buf.readUint32LE(0), f, n;
				if(!ofs || ofs >= buf.length) throw `Bad header len ${ofs}`;
				ofs += 4;
				const hdr = JSON.parse(buf.toString('utf8', 4, ofs));
				schema.checkType(hdr, RHdrFmt);
				//Split data
				for(f of hdr) {
					n = ofs + f.l;
					f.d = buf.subarray(ofs, n);
					ofs = n;
				}
				if(buf.length !== ofs) throw `Payload length mismatch ${buf.length} != ${ofs}`;
				sck.cliLog('magenta', "Upload");
				log(hdr);
				sck.rData = hdr;
				res.end("OK");
			} catch(e) {httpErr(sck, res, 400, `Receipts ${e}`)}});
		} else router.handle(Web, req, res, VDir);
	}
	let srv=(SrvOpt?https.createServer(SrvOpt,onReq):http.createServer(onReq)).listen(Port, () => {
		log(`Listening at ${C.bgGreen(`http${SrvOpt?'s':''}://${SrvIp}:${Port}`)}\n`);
	});
	//Init Socket.io
	new io(srv).on('connection', sck => {
		sck.adr = sck.handshake.address.slice(7); //TODO Always blank
		log(C.cyan("[SCK] New client"));
		sck.on('disconnect', () => {
			log(C.red("[SCK] Connection dropped during init"));
		});
		sck.once('type', async (cType, tkn, id) => {
			if(cType !== 'form') return log(C.red("[SCK] Bad type"), sck.adr);
			sck.type = cType;
			sck.cliLog = (clr, ...a) => log(C[clr](`[${sck.type}:${sck.uid}]`, ...a));
			sck.cliErr = (...a) => sck.cliLog('red', ...a);
			if(id) { //Verify by ID
				sck.uid = id;
				const oSck = Cli[id];
				if(!oSck) {
					sck.cliErr(`Bad ID '${id}'`);
					return setTimeout(() => sck.emit('badTkn'), 1000);
				}
				clearTimeout(oSck.dTmr);
			} else { //Verify by token
				let v;
				try {v=await Otp.verify({token:tkn, secret:Conf.otpkey})} catch(e) {sck.cliErr(e)}
				if(!v || !v.valid) {
					sck.cliErr(`Bad token '${tkn}'`);
					return setTimeout(() => sck.emit('badTkn'), 1000);
				}
				sck.uid = crypto.randomUUID();
			}
			log(C.yellow(`[SCK] Connected tkn=${tkn}`, cliToStr(sck)));
			initCli(sck);
		});
		sck.emit('type'); //Request type
	});
}

function initCli(sck) {
	Cli[sck.uid] = sck;
	if(Debug) logClientList();
	sck.removeAllListeners();

	sck.on('getEvent', ev => getEvent(sck, ev));

	function tStop() {
		if(!sck.tmr) return;
		clearTimeout(sck.tmr);
		--EvLoad, delete sck.tmr;
	}
	sck.on('sendForm', async (title, date, uName, uMail, cMat, pdf, aList, sType) => {const EV='sendForm'; try {
		if(EvLoad >= EvMaxReq || sck.tmr) throw "Server busy";
		++EvLoad;
		const rData=sck.rData;
		delete sck.rData;
		//Error Checking
		if(tyS(title) || title.length > 120 || !pTitle.test(title)) throw "Bad input: title";
		if(title.indexOf(':') == -1 || Number(title)) throw "Invalid title! Did you mean to auto-fill"+
			" via class ID? To auto-fill, please select the name field again and press ENTER or ⏎";
		if(tyS(date) || date.length > 80 || !pDate.test(date)) throw "Bad input: date";
		if(tyS(uName) || !pText.test(uName)) throw "Bad input: instructorName";
		if(tyS(uMail) || !pEmail.test(uMail)) throw "Bad input: instructorMail";
		if(tyN(cMat) || cMat < 0) throw "Bad input: materialCost";
		if(tyS(pdf) || pdf.length < 1) throw "Bad input: PDF";
		if(cMat && !rData) throw "Receipts required if materialCost > $0";
		if(pdf.length > 20000) throw "PDF exceeded max size 20KB";
		if(!Array.isArray(aList) || aList.length > 200) throw "Bad input: attendeeList";
		if(tyN(sType) || sType<0 || (sType && !aList.length)) throw "Bad input: classType";

		//Attendee List Error Checking
		for(let i=0,a,e=0,l=aList.length; i<l; ++i) {
			a=aList[i]; if(a.length !== 4) e="Invalid Length";
			a.splice(0,2,a[0]+a[1]);
			if(tyS(a[0]) || a[0].length > 80 || !pText.test(a[0])) e="Name Invalid";
			if(tyS(a[1]) || a[1].length > 40) e="Level Invalid";
			if(tyS(a[2]) || a[2].length > 15) e="Price Invalid";
			if(e) throw `Bad input: attendeeList[${i}]: ${e}`;
		}

		sck.cliLog('yellow', `(${EV}) Submitting '${title}'...`);
		sck.tmr = setTimeout(() => {
			ack(sck, EV, "Failed to send email: Timed out!", 1);
			--EvLoad, delete sck.tmr;
		}, SendTimeout);

		//Embedded Event
		const ev = genEvent(sck.evm, uName);
		let sb = (uMail==='test@example.com'?"<<FORMBOT_TEST>>":"FormBot: ")+title+" on "+date,
		aTab = aList.length?(sType===2?"<p style='color:#f00'><b>No NovaPass or tool sign off. Safety Sign-Off Only.</b></p>":'')+(cMat?"Materials: "+utils.formatCost(cMat):'')+"<p>Event Attendee List:</p>"+genTable(aList):'',
		atp = title.indexOf('-'),
		atList = [{filename:title.slice(0,atp==-1?undefined:atp).replace(/\s/g,'')+'.pdf', contentType:router.types['.pdf'], content:pdf}];

		//Receipts
		if(rData) for(let r of rData) atList.push({filename:r.n, contentType:r.t, content:r.d});

		//Send Emails
		let al=AccAddr.slice(), ok=0; al.push(uMail);
		if(sType) al.push(MemAddr);
		for(let i in al) {
			let a=al[i]; log("-",C.yellow(a));
			Mailer.sendMail({
				from:MailHost, to:a, subject:sb, text:MsgHeader+NoHTML, html:`<body style='${MsgStyle}'><p><b>${MsgHeader}</b></p>${ev+aTab}<br>Formbot ${VER} by <a href='https://github.com/pecacheu'>Pecacheu</a></body>`, attachments:atList
			}, (e,r) => {
				if(e) return tStop(), ack(sck, EV, `Failed to send to ${a}: `+e, e);
				sck.cliLog('yellow', a+": Email sent!");
				log("REPLY:", r.response);
				if(ok >= al.length-1) tStop(), ack(sck,EV); else ++ok;
			});
		}
	} catch(e) {
		ack(sck, EV, e, e);
		--EvLoad, delete sck.tmr;
	}});

	//Handle disconnection
	sck.once('disconnect', () => {
		sck.cliErr("Connection lost");
		sck.dTmr = setTimeout(() => {delete Cli[sck.uid]}, IDTimeout);
	});
	sck.emit('connection', sck.uid, VER);
}

function tyS(v) {return typeof v !== 'string'}
function tyN(v) {return typeof v !== 'number'}

const tStyle='overflow:hidden;max-width:1000px;color:#888;border-radius:10px;width:100%;border-collapse:collapse;background:#f5f5f5;box-shadow:2px 2px 2px rgba(0,0,0,0.3);font-size:16px;table-layout:fixed', tdStyle='border-top:1px solid #eee;padding:9px 12px;line-height:15px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden', trFirstStyle='border-top:none;background:#eee', trEvenStyle="style='background:#dcdcdc'", nameStyle='font-weight:700', mailStyle='color:#5299e2;font-weight:500', userStyle='text-align:right';

function genTable(tb) {
	let lh=''; function makeRow(a,i) {
		if(!a[2]) a[2]=''; lh += "<tr "+(i%2?'':trEvenStyle)+"><td style='"+tdStyle+';'+nameStyle+"'>"+a[0]+"</td>"+
		"<td style='"+tdStyle+';'+mailStyle+"'>"+a[1]+"</td><td style='"+tdStyle+';'+userStyle+"'>"+a[2]+"</td></tr>";
	}
	for(let i=0,l=tb.length; i<l; ++i) makeRow(tb[i],i);
	return "<table style='"+tStyle+"'><tr style='"+trFirstStyle+"'><th style='width:40%'>Name</th><th>Member Level</th><th>Payment</th></tr>"+lh+"</table>";
}

const muEvent='width:550px;overflow:hidden;font-size:16px;border-radius:8px;padding:16px;border:1px solid rgba(0,0,0,0.12);background:#fafafa;box-shadow:2px 2px 2px rgba(0,0,0,0.3); color:rgba(0,0,0,0.87)', muLink='color:inherit;display:inline-block;text-decoration:none;vertical-align:bottom;', muTitle='font-size:16pt;font-weight:600;white-space:pre-line', muDetail='margin-top:6px;width:70%;float:left', muVen='color:rgb(0,154,227)', muSub='color:rgba(0,0,0,0.54);font-size:13px', muDesc='margin-top:6px;line-height:1.35em;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;height:84px;overflow:hidden', muMeta='margin-top:8px;float:right', muRSVP='margin-top:6px;font-size:13.5px', muHosts='margin-top:6px;display:inline-block;width:100%;color:rgba(0,0,0,0.54);font-size:13px';

function genEvent(ev, host) {
	if(!ev) return "<p>FormBot Couldn't Find This Event.</p>";
	let eh=ev.hosts, hc="", chgHost=1;
	for(let i=0,l=eh.length,n; i<l; ++i) {
		n=eh[i].name;
		hc+=(i?', ':'')+`<a href='${ev.link}' target='_blank' style='${muLink+muVen}'>${n}</a>`;
		if(host == n) chgHost=0;
	}
	if(host && chgHost) hc=host+` (Originally ${hc})`;
	return `<p>Formbot thinks this event is:</p><div style='${muEvent}'><a style='${muLink+muTitle}' href='${ev.link}' target='_blank'>${ev.name}</a><div style='${muDetail}'><a style='${muLink+muVen}' href='${ev.link}' target='_blank'>${ev.ven}</a><div style='${muSub}'>${ev.loc}</div><div style='${muDesc}'>${ev.desc}</div></div><div style='${muMeta}'><div style='${muSub+';margin-bottom:6px'}'>100% Match</div><div>${ev.time}</div><div style='${muSub}'>${ev.date}</div><div style='${muRSVP}'>${ev.yes} Attendees<br>${ev.wait} Waitlist</div><div style='margin-top:6px'>${ev.fee}</div></div><div style='${muHosts}'>Hosted By: ${hc}</div></div>`;
}

function ack(sck, eType, stat, err) {
	if(err) sck.cliErr(`(${eType}) `+stat, ...(err instanceof Error?[err]:[]));
	else sck.cliLog('green', "ACK true");
	sck.emit('ack', eType, !err, err?stat.toString():stat);
}

function cliToStr(sck) {
	return `{type=${sck.type}, adr=${sck.adr}, id=${sck.uid}}${sck.dTmr?C.dim(" [Disconnected]"):''}`;
}

function logClientList() {
	let c;
	console.log("Clients:");
	for(c in Cli) console.log("-", C.yellow(cliToStr(Cli[c])));
}

function runInput() {
	console.log("Type 'list' to list clients or 'q' to quit.");
	process.stdin.resume(); process.stdin.setEncoding('utf8');
	process.stdin.on('data', cmd => {
		for(let s; (s=cmd.search(/[\n\r]/)) != -1;) cmd=cmd.slice(0,s);
		if(cmd == 'exit' || cmd == 'q') {
			console.log(C.magenta("Exiting..."));
			process.exit();
		} else if(cmd == 'list') logClientList();
	});
}

function httpErr(sck, res, code, msg) {
	const e = `Upload Code ${code}: ${msg}`;
	if(sck) sck.cliErr(e); else console.error(e);
	res.writeHead(code,''), res.write(`<pre style='font-size:16pt'>${msg}</pre>`), res.end();
}

function log(...a) {console.log(C.dim(C.yellow(`[${utils.formatDate(new Date(), LogDateFmt)}]`)), ...a)}

await begin();