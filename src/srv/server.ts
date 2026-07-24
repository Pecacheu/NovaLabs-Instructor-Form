//Instructor Form, Pecacheu 2026. GNU GPL v3
const VER = 'v4.1.1';

import fs from 'fs';
import http from 'http';
import https from 'https';
import path from 'path';

import C from 'chalk';
import type { ForegroundColorName } from 'chalk';
import mail from 'nodemailer';
import { OTP } from 'otplib';
import utils from 'raiutils';
import router from 'raiutils/router';
import schema, { type Entry } from 'raiutils/schema';
import { Server as io, Socket } from 'socket.io';
import { stripHtml } from 'string-strip-html';

//Config Options
const Port = 8080,
	SendTimeout = 15000,
	ReqTimeout = 5000,
	EvMaxReq = 10,
	IDTimeout = 4 * 3600000, //4 Hours
	MaxUpload = 1e9, //1GB
	Debug = process.argv.indexOf('dev') !== -1 ? 2 : 0,
	App = path.resolve(import.meta.dirname + '/../..'),
	Web = App + '/dist/web',
	Conf = JSON.parse(fs.readFileSync(App + '/config.json', {encoding: 'utf8'})),
	Otp = new OTP();

//Filter Patterns
const pTitle = /^[\w\-:.<>()[\]&*%!', ]+$/, pText = /^[\w+\-()'. ]+$/,
	pEmail = /^\w+(?:[.+-]\w+)*@\w+(?:[.-]\w+)*\.\w\w+$/, pDate = /^[\w,: ]+$/;

//Schemas
const RHdrFmt: Entry = {t: 'list',
		f: {
			n: {t: 'str', max: 200},
			t: {t: 'str', max: 50},
			l: {t: 'int', min: 1}
		}},
	LogDateFmt = {suf: false, year: false, df: true};

//Messages
const MsgHeader = '{ NovaLabs Formbot Automated Message }', MsgStyle = 'font:20px "Segoe UI",Helvetica,Arial',
	NoHTML = '\nHTML-enabled viewer is required for viewing this message.\n\nPowered by bTech.';

//Email Addresses
const MailHost = 'formbot@nova-labs.org',
	AccAddr = ['formbot-events-relay@nova-labs.org'],
	MemAddr = 'formbot-membership-relay@nova-labs.org';

//Auth Keys
const AuthUri = 'https://oauth.wildapricot.org/auth/token',
	ApiUri = 'https://api.wildapricot.org/v2/accounts/';

type FileData = {
	n: string;
	t: string;
	l: number;
	d: Buffer;
}[];

interface Client extends Socket {
	type: 'form';
	adr: string;
	uid: string;
	evm?: EventData;
	rData?: FileData;
	tmr?: NodeJS.Timeout;
	dTmr?: NodeJS.Timeout;
	cliLog: (clr: ForegroundColorName, ...a: any[]) => void;
	cliErr: (...a: any[]) => void;
}

const Cli: {[k: string]: Client} = {};
let SrvIp: string,
	SrvOpt: https.ServerOptions,
	Mailer: mail.Transporter,
	ATkn: Promise<number> | number,
	AUsr: string,
	EvLoad = 0;

try {
	if(!Conf.key || !Conf.cert) throw 1;
	SrvOpt = {key: fs.readFileSync(Conf.key), cert: fs.readFileSync(Conf.cert)};
} catch(e) {console.log(C.dim('Warning: Could not load certificates! HTTPS disabled'))}

async function begin() {
	const ips = utils.getIPs(), [sysOS, arch, cpu] = utils.getOS();
	console.log('IP:', ips, `OS: ${sysOS}, ${arch}\nCPU: ${cpu}\n\n` + C.yellow(`FormBot ${VER}`));
	SrvIp = ips[0] || 'localhost';
	if(Debug > 1) router.debug = 1;
	getAuth().then(initMail).catch(e => console.log(C.bgRed('AuthKey'), e));
}

async function getAuth() {
	if(ATkn instanceof Promise) return ATkn; //Await fetch
	if(!ATkn) try {
		const hdr = {
				'Content-type': 'application/x-www-form-urlencoded',
				Authorization: 'Basic ' + Buffer.from('APIKEY:' + Conf.apikey).toString('base64')
			}, d = JSON.parse(await httpsReq(AuthUri, 'POST', hdr, 'grant_type=client_credentials&scope=auto')),
			ex = d.expires_in;
		if(!(ATkn = d.access_token)) throw 'Invalid Token';
		if(!(AUsr = d.Permissions[0].AccountId)) throw 'Invalid UUID';
		log('Auth Token:', ATkn, 'UID:', AUsr, 'Exp:', ex);
		setTimeout(() => (ATkn = 0, log(C.dim('Token expired'))), ex * 1000);
	} catch(e) {
		ATkn = 0;
		throw e;
	}
}

function initMail() {
	Mailer = mail.createTransport({
		host: 'smtp.gmail.com',
		port: 587,
		requireTLS: true,
		auth: {user: MailHost, pass: Conf.mailpass}
	});
	Mailer.verify(e => {
		if(e) {
			log(C.bgRed('SMTP Init'), e);
			return process.exit();
		}
		log('SMTP connected!');
		startServer();
		runInput();
	});
}

async function getEvent(cli: Client, eid: string) {
	if(EvLoad >= EvMaxReq) throw 'Server busy';
	const EV = 'getEvent';
	++EvLoad;
	try {
		if(!eid || tyS(eid) || eid.length > 20) throw 'Invalid event';
		await getAuth();
		cli.evm = await getEvData(eid);
		log('Got Event', eid);
		ack(cli, EV, cli.evm);
	} catch(e) {
		ack(cli, EV, e, e);
	} finally {
		--EvLoad;
	}
}
async function getEvData(eid: string) {
	const hd = {Authorization: 'Bearer ' + ATkn};
	const d = JSON.parse(await httpsReq(ApiUri + AUsr + '/events/' + eid, 'GET', hd)),
		dr = JSON.parse(await httpsReq(ApiUri + AUsr + '/eventregistrations?eventId=' + eid, 'GET', hd));
	//Parse
	const rt = d.Details.RegistrationTypes, ev: Partial<EventData> = {
		name: d.Name.normalize('NFKD').replace(/[^\x20-\x7E]/g, ''),
		id: d.Id,
		link: 'https://portal.nova-labs.org/event-' + d.Id,
		ven: 'Nova Labs',
		loc: d.Location,
		fRaw: 0,
		dRaw: d.StartDate,
		yes: d.ConfirmedRegistrationsCount,
		wait: d.PendingRegistrationsCount,
		desc: stripHtml(d.Details.DescriptionHtml).result,
		hosts: [],
		rsvp: []
	};
	//Date & Time
	const dt = utils.formatDate(new Date(ev.dRaw!)), ds = dt.indexOf(' ', 6);
	ev.time = dt.slice(0, ds), ev.date = dt.slice(ds + 1);
	//Fee Info
	for(const r of rt) ev.fRaw = Math.max(r.BasePrice || 0, ev.fRaw!);
	ev.fee = ev.fRaw ? utils.formatCost(ev.fRaw) : 'Free';
	//RSVP
	for(let i = 0, l = dr.length, u; i < l; ++i) {
		try {u = await getEvUser(u = dr[i], hd)} catch(e) {
			throw `User[${u && u.RegistrationType ? u.RegistrationType.Name : i}] ${e}`;
		}
		if(u.h) ev.hosts!.push(u);
		else ev.rsvp!.push(u);
	}
	ev.yes! -= ev.hosts!.length;
	if(Debug) ev.raw = [d, dr];
	return ev as any as EventData;
}
async function getEvUser(u: any, hd: http.OutgoingHttpHeaders) {
	let fn, ln, em;
	const r = u.RegistrationFields, t = u.RegistrationType;
	for(const u of r) switch(u.SystemCode) {
	case 'FirstName': fn = u.Value; break;
	case 'LastName': ln = u.Value; break;
	case 'Email': em = u.Value;
	}
	if(!fn && !ln || !em || !t || !t.Name || !u.Contact) throw 'Data Error';
	//Get Member Level
	const c = JSON.parse(await httpsReq(ApiUri + AUsr + '/contacts/' + u.Contact.Id, 'GET', hd));
	return {
		name: (fn || '') + (fn && ln ? ' ' : '') + (ln || ''),
		email: em,
		id: u.Contact.Id,
		fee: u.PaidSum || 0,
		level: c.MembershipLevel ? c.MembershipLevel.Name : null,
		h: t.Name.toLowerCase().startsWith('5. instructor')
	} as Member;
}

function httpsReq(uri: string, method: 'GET' | 'POST', headers: http.OutgoingHttpHeaders, reqBody?: string) {
	return new Promise<string>((res, rej) => {
		let dat = '', re: http.IncomingMessage, ee: boolean;
		const rq = https.request(uri, {method, headers}, r => {
			re = r, r.setEncoding('utf8'), r.on('data', d => dat += d), r.on('end', rEnd);
		}).on('error', rEnd);
		if(reqBody) rq.write(reqBody);
		rq.end();
		const tt = setTimeout(() => rEnd(Error('Timed Out')), ReqTimeout);
		function rEnd(e: any) {
			if(ee) return;
			if(e) rq.destroy();
			ee = true, clearTimeout(tt);
			if(!e && re.statusCode !== 200) rej(Error(`Code ${re.statusCode}${dat ? ' ' + dat : ''} ${uri}`));
			else res(dat);
		}
	});
}

function onReq(req: http.IncomingMessage, res: http.ServerResponse) {
	const url = req.url!;
	if(Debug) log('[ROUTER]', url);
	if(req.method === 'POST' && url.startsWith('/upload?')) {
		//ID check
		const cli = Cli[utils.fromQuery(url.slice(8))['id'] as string];
		if(!cli) return httpErr(null, res, 401, 'Bad ID');
		delete cli.rData;
		//Read data
		let buf: Buffer | undefined;
		req.on('data', b => {
			if((buf ? buf.length : 0) + b.length > MaxUpload) {
				req.removeAllListeners();
				return httpErr(cli, res, 413, 'File(s) too large');
			}
			buf = buf ? Buffer.concat([buf, b]) : b;
		});
		req.on('end', () => {
			try {
				//Parse header
				if(!buf) throw 'No data';
				let ofs = buf.readUint32LE(0), f, n;
				if(!ofs || ofs >= buf.length) throw `Bad header len ${ofs}`;
				ofs += 4;
				const hdr = JSON.parse(buf.toString('utf8', 4, ofs)) as FileData;
				schema.checkType(hdr, RHdrFmt);
				//Split data
				for(f of hdr) {
					n = ofs + f.l;
					f.d = buf.subarray(ofs, n);
					ofs = n;
				}
				if(buf.length !== ofs) throw `Payload length mismatch ${buf.length} != ${ofs}`;
				cli.cliLog('magenta', 'Upload');
				log(hdr);
				cli.rData = hdr;
				res.end('OK');
			} catch(e) {httpErr(cli, res, 400, `Receipts ${e}`)}
		});
	} else router.handle(Web, req, res);
}

function startServer() {
	const srv = (SrvOpt ? https.createServer(SrvOpt, onReq) : http.createServer(onReq)).listen(Port, () => {
		log(`Listening at ${C.bgGreen(`http${SrvOpt ? 's' : ''}://${SrvIp}:${Port}`)}\n`);
	});
	//Init Socket.io
	new io(srv, {serveClient: false}).on('connection', ((cli: Client) => {
		// const hdr = cli.handshake.headers;
		// cli.adr = `${hdr['x-real-ip']}:${hdr['x-real-port']}`;
		cli.adr = cli.conn.remoteAddress; //TODO Always blank
		log(C.cyan('[SCK] New client'));
		cli.on('disconnect', () => {
			log(C.red('[SCK] Connection dropped during init'));
		});
		cli.once('type', async (cType, tkn, id) => {
			if(cType !== 'form') return log(C.red(`[SCK] Bad type ${cType}`), cli.adr);
			cli.type = cType;
			cli.cliLog = (clr, ...a) => log(C[clr](`[${cli.type}:${cli.uid}]`, ...a));
			cli.cliErr = (...a) => cli.cliLog('red', ...a);
			if(id) { //Verify by ID
				cli.uid = id;
				const oSck = Cli[id];
				if(!oSck) {
					cli.cliErr(`Bad ID '${id}'`);
					return setTimeout(() => cli.emit('badTkn'), 1000);
				}
				clearTimeout(oSck.dTmr);
			} else { //Verify by token
				let v;
				try {
					v = await Otp.verify({token: tkn, secret: Conf.otpkey});
				} catch(e) {cli.cliErr(e)}
				if(!v || !v.valid) {
					cli.cliErr(`Bad token '${tkn}'`);
					if(!Debug) return setTimeout(() => cli.emit('badTkn'), 1000);
				}
				cli.uid = crypto.randomUUID();
			}
			log(C.yellow(`[SCK] Connected tkn=${tkn}`, cliToStr(cli)));
			initCli(cli);
		});
		cli.emit('type'); //Request type
	}) as (s: Socket) => void);
}

function initCli(cli: Client) {
	Cli[cli.uid] = cli;
	if(Debug) logClientList();
	cli.removeAllListeners();

	cli.on('getEvent', ev => getEvent(cli, ev));

	function tStop() {
		if(!cli.tmr) return;
		clearTimeout(cli.tmr);
		--EvLoad, delete cli.tmr;
	}
	cli.on('sendForm', async (title: string, date: string, uName: string, uMail: string,
		cMat: number, pdf: string, aList: AttendeeList, sType: number) => {
		const EV = 'sendForm';
		try {
			if(EvLoad >= EvMaxReq || cli.tmr) throw 'Server busy';
			++EvLoad;
			const rData = cli.rData;
			delete cli.rData;
			//Error Checking
			if(tyS(title) || title.length > 120 || !pTitle.test(title)) throw 'Bad input: title';
			if(title.indexOf(':') === -1 || Number(title)) throw 'Invalid title! Did you mean to auto-fill' +
				' via class ID? To auto-fill, please select the name field again and press ENTER or ⏎';
			if(tyS(date) || date.length > 80 || !pDate.test(date)) throw 'Bad input: date';
			if(tyS(uName) || !pText.test(uName)) throw 'Bad input: instructorName';
			if(tyS(uMail) || !pEmail.test(uMail)) throw 'Bad input: instructorMail';
			if(tyN(cMat) || cMat < 0) throw 'Bad input: materialCost';
			if(tyS(pdf) || pdf.length < 1) throw 'Bad input: PDF';
			if(cMat && !rData) throw 'Receipts required if materialCost > $0';
			if(pdf.length > 20000) throw 'PDF exceeded max size 20KB';
			if(!Array.isArray(aList) || aList.length > 200) throw 'Bad input: attendeeList';
			if(tyN(sType) || sType < 0 || sType && !aList.length) throw 'Bad input: classType';

			//Attendee List Error Checking
			for(let i = 0, a, e, l = aList.length; i < l; ++i) {
				if((a = aList[i]!).length !== 4) e = 'Invalid Length'; else {
					a.splice(0, 2, a[0] + a[1]);
					if(tyS(a[0]) || a[0].length > 80 || !pText.test(a[0])) e = 'Name Invalid';
					if(tyS(a[1]) || a[1].length > 40) e = 'Level Invalid';
					if(tyS(a[2]) || a[2].length > 15) e = 'Price Invalid';
				}
				if(e) throw `Bad input: attendeeList[${i}]: ${e}`;
			}

			cli.cliLog('yellow', `(${EV}) Submitting '${title}'...`);
			cli.tmr = setTimeout(() => {
				ack(cli, EV, 'Failed to send email: Timed out!', 1);
				--EvLoad, delete cli.tmr;
			}, SendTimeout);

			//Embedded Event
			const ev = genEvent(cli.evm, uName),
				sb = `${uMail === 'test@example.com' ? '<<FORMBOT_TEST>>' : 'FormBot: '}${title} on ${date}`,
				aTab = aList.length ? (sType === 2 ? `<p style='color:#f00'><b>No NovaPass or tool sign off. Safety Sign-Off Only.</b></p>` : '') + (cMat ? `Materials: ${utils.formatCost(cMat)}` : '') + `<p>Event Attendee List:</p>${genTable(aList)}` : '',
				atp = title.indexOf('-'),
				atList = [{filename: title.slice(0, atp === -1 ? undefined : atp).replace(/\s/g, '') + '.pdf',
					contentType: router.types['.pdf'],
					content: pdf as string | Buffer}];

			//Receipts
			if(rData) for(const r of rData) atList.push({filename: r.n, contentType: r.t, content: r.d});

			//Send Emails
			let ok = 0;
			const al = AccAddr.slice();
			al.push(uMail);
			if(sType) al.push(MemAddr);
			for(const i in al) {
				const a = al[i];
				log('-', C.yellow(a));
				Mailer.sendMail({
					from: MailHost, to: a, subject: sb, text: MsgHeader + NoHTML, html: `<body style='${MsgStyle}'><p><b>${MsgHeader}</b></p>${ev + aTab}<br>Formbot ${VER} by <a href='https://github.com/pecacheu'>Pecacheu</a></body>`, attachments: atList
				}, (e, r) => {
					if(e) return tStop(), ack(cli, EV, `Failed to send to ${a}: ${e}`, e);
					cli.cliLog('yellow', `${a}: Email sent!`);
					log('REPLY:', r.response);
					if(ok >= al.length - 1) tStop(), ack(cli, EV);
					else ++ok;
				});
			}
		} catch(e) {
			ack(cli, EV, e, e);
			--EvLoad, delete cli.tmr;
		}
	});

	//Handle disconnection
	cli.once('disconnect', () => {
		cli.cliErr('Connection lost');
		cli.dTmr = setTimeout(() => delete Cli[cli.uid], IDTimeout);
	});
	cli.emit('connection', cli.uid, VER);
}

const tyS = (v: any) => typeof v !== 'string';
const tyN = (v: any) => typeof v !== 'number';

const tStyle = `overflow:hidden;max-width:1000px;color:#888;border-radius:10px;width:100%;border-collapse:collapse;background:#f5f5f5;box-shadow:2px 2px 2px rgba(0,0,0,0.3);font-size:16px;table-layout:fixed`, tdStyle = `border-top:1px solid #eee;padding:9px 12px;line-height:15px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden`, trFirstStyle = `border-top:none;background:#eee`, trEvenStyle = `style='background:#dcdcdc'`, nameStyle = `font-weight:700`, mailStyle = `color:#5299e2;font-weight:500`, userStyle = `text-align:right`;

function genTable(al: AttendeeList) {
	let lh = '';
	al.forEach((a, i) => lh += `<tr ${i % 2 ? '' : trEvenStyle}><td style='${tdStyle};${nameStyle}'>${a[0]}</td><td style='${tdStyle};${mailStyle}'>${a[1]}</td><td style='${tdStyle};${userStyle}'>${a[2] || ''}</td></tr>`);
	return `<table style='${tStyle}'><tr style='${trFirstStyle}'><th style='width:40%'>Name</th><th>Member Level</th><th>Payment</th></tr>${lh}</table>`;
}

const muEvent = `width:550px;overflow:hidden;font-size:16px;border-radius:8px;padding:16px;border:1px solid rgba(0,0,0,0.12);background:#fafafa;box-shadow:2px 2px 2px rgba(0,0,0,0.3); color:rgba(0,0,0,0.87)`, muLink = `color:inherit;display:inline-block;text-decoration:none;vertical-align:bottom;`, muTitle = `font-size:16pt;font-weight:600;white-space:pre-line`, muDetail = `margin-top:6px;width:70%;float:left`, muVen = `color:rgb(0,154,227)`, muSub = `color:rgba(0,0,0,0.54);font-size:13px`, muDesc = `margin-top:6px;line-height:1.35em;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;height:84px;overflow:hidden`, muMeta = `margin-top:8px;float:right`, muRSVP = `margin-top:6px;font-size:13.5px`, muHosts = `margin-top:6px;display:inline-block;width:100%;color:rgba(0,0,0,0.54);font-size:13px`;

function genEvent(ev?: EventData, host?: string) {
	if(!ev) return "<p>FormBot Couldn't Find This Event.</p>";
	const eh = ev.hosts;
	let hc = '', chgHost = 1;
	for(let i = 0, l = eh.length, n; i < l; ++i) {
		n = eh[i]!.name;
		hc += (i ? ', ' : '') + `<a href='${ev.link}' target='_blank' style='${muLink + muVen}'>${n}</a>`;
		if(host === n) chgHost = 0;
	}
	if(host && chgHost) hc = host + ` (Originally ${hc})`;
	return `<p>Formbot thinks this event is:</p><div style='${muEvent}'><a style='${muLink + muTitle}' href='${ev.link}' target='_blank'>${ev.name}</a><div style='${muDetail}'><a style='${muLink + muVen}' href='${ev.link}' target='_blank'>${ev.ven}</a><div style='${muSub}'>${ev.loc}</div><div style='${muDesc}'>${ev.desc}</div></div><div style='${muMeta}'><div style='${muSub + ';margin-bottom:6px'}'>100% Match</div><div>${ev.time}</div><div style='${muSub}'>${ev.date}</div><div style='${muRSVP}'>${ev.yes} Attendees<br>${ev.wait} Waitlist</div><div style='margin-top:6px'>${ev.fee}</div></div><div style='${muHosts}'>Hosted By: ${hc}</div></div>`;
}

function ack(cli: Client, eType: string, data?: any, err?: any) {
	if(err) cli.cliErr(`(${eType}) ${data}`, ...err instanceof Error ? [err] : []);
	else cli.cliLog('green', 'ACK true');
	cli.emit('ack', eType, !err, err && data ? data.toString() : data);
}

function cliToStr(cli: Client) {
	return `{type=${cli.type}, adr=${cli.adr}, id=${cli.uid}}${cli.dTmr ? C.dim(' [Disconnected]') : ''}`;
}

function logClientList() {
	let c;
	console.log('Clients:');
	for(c in Cli) console.log('-', C.yellow(cliToStr(Cli[c]!)));
}

function runInput() {
	console.log("Type 'list' to list clients or 'q' to quit.");
	process.stdin.resume(), process.stdin.setEncoding('utf8');
	process.stdin.on('data', (cmd: string) => {
		for(let s; (s = cmd.search(/[\n\r]/)) !== -1;) cmd = cmd.slice(0, s);
		if(cmd === 'exit' || cmd === 'q') {
			console.log(C.magenta('Exiting...')), process.exit();
		} else if(cmd === 'list') logClientList();
	});
}

function httpErr(cli: Client | null, res: http.ServerResponse, code: number, msg: string) {
	const e = `Upload Code ${code}: ${msg}`;
	if(cli) cli.cliErr(e);
	else console.error(e);
	res.writeHead(code, ''), res.write(`<pre style='font-size:16pt'>${msg}</pre>`), res.end();
}

const log = (...a: any[]) => console.log(C.dim(C.yellow(`[${utils.formatDate(new Date(), LogDateFmt)}]`)), ...a);

await begin();