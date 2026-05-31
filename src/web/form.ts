//Instructor Form, Pecacheu 2026. GNU GPL v3

import './form.css';
import jsPDF from 'jspdf';
import type { QueryMap } from 'raiutils';
import utils from 'raiutils';
import { connect as ioConnect, Socket } from 'socket.io-client';
import bgSvg from './r/bg.svg';

interface SData {
	id?: string;
	v?: string;
	c?: boolean;
	sl?: AttendeeList;
};

const FormType = 'Instructor Formbot', SData: SData = {};
let DS: CSSStyleDeclaration, BDF: boolean, Sck: Socket, QData: QueryMap,
	StatMsg: boolean, PdfData: string | null, PdfSub: boolean, EvData: EventData | null;

//---------------------------------------- Background Animation ----------------------------------------

const BgSize = 400, BgSpd = 10 / 1000, OCMax = 255 << 24;
let Blur: boolean, BgPos = 0, BSkp = 0, BTs: number, BgGPU: boolean;

window.onblur = () => Blur = true;
window.onfocus = () => Blur = false;

function initBg() {
	BgGPU = utils.mobile!, BgBox._i = new Image(), BgBox._i.src = bgSvg;
	BgBox._c = BgBox.getContext('2d', {alpha: true, willReadFrequently: true})!;
	BgBox._c.imageSmoothingEnabled = false;
	onscroll = () => BSkp = 1, (onresize = bgScale)();
	requestAnimationFrame(bgRun);
}

function bgRun() {
	if(!StatMsg) if(BSkp === 1) {
		BSkp = 0;
		const t = performance.now();
		BgPos = utils.norm(BgPos + BgSpd * (BTs ? t - BTs : 0), -400, 0), BTs = t;
		const p = utils.norm(BgPos + scrollY / 4, -400, 0);
		//Tiles
		const ctx = BgBox._c, r = BgBox._r;
		ctx.setTransform(r, 0, 0, r, 0, 0);
		let w = BgBox._w, h = BgBox._h, x, y = 0, sx = 1, sy = 1;
		const bw = w + BgSize, bh = h + BgSize;
		for(; y < bh; y += BgSize) for(x = 0; x < bw; x += BgSize) ctx.drawImage(BgBox._i, p + x, p + y);
		//Gradient Fill
		w *= r, h *= r;
		if(w > h) ctx.scale(1, sy = h / w);
		else ctx.scale(sx = w / h, 1);
		const gw = w / sx, gh = h / sy, w2 = gw / 2, h2 = gh / 2,
			g = ctx.createRadialGradient(w2, h2, 0, w2, h2, w > h ? w : h);
		g.addColorStop(0, 'rgba(0,0,0,0)'), g.addColorStop(.8, 'rgba(0,0,0,.9');
		ctx.fillStyle = g, ctx.fillRect(0, 0, gw, gh);
		//Blur
		if(!BgGPU) { //Software Blur - Uses CPU, runs better on desktop
			const b = ContBox.boundingRect, bX = Math.floor(b.x * r), bY = Math.floor(b.y * r),
				bW = Math.floor(b.width * r), bH = Math.floor(b.height * r), px = ctx.getImageData(bX, bY, bW, bH);
			boxBlur4(px.data, bW, bH, 12);
			ctx.putImageData(px, bX, bY);
		}
	} else if(!Blur) ++BSkp;
	requestAnimationFrame(bgRun);
}

function bgScale(f?: UIEvent | true) {
	let w = innerWidth, h = innerHeight, r = (devicePixelRatio || 1) / 2;
	const dw = BgBox._w - w, dh = BgBox._h - h;
	if(r < 1) r = 1;
	if(f !== true && BgBox._r === r && dw >= 0 && dw < 300 && dh >= 0 && dh < 300) return;
	w += 50, h += 50;
	const s = BgBox.style;
	s.width = (BgBox._w = w) as any as string, s.height = (BgBox._h = h) as any as string;
	BgBox.width = w * r, BgBox.height = h * r, BgBox._r = r;
	//Hardware Blur - Better for GPU-optimized mobile browsers
	ContBox.style.backdropFilter = BgGPU ? 'blur(8px)' : '';
}

//Thanks to: http://blog.ivank.net/fastest-gaussian-blur.html
function boxBlur4(d: ArrayBufferView, w: number, h: number, r: number) {
	d = new Uint32Array(d.buffer), boxBlurH4(d as Uint32Array, w, h, r), boxBlurT4(d as Uint32Array, w, h, r);
}
function boxBlurH4(d: Uint32Array, w: number, h: number, r: number) {
	const ia = 1 / (r + r + 1);
	let i = 0, ti, li, ri, fv, lv, val, j, v;
	for(; i < h; ++i) {
		ti = i * w, li = ti, ri = ti + r, fv = d[ti]! & 255, lv = d[ti + w - 1]! & 255, val = (r + 1) * fv;
		for(j = 0; j < r; ++j) val += d[ti + j]! & 255;
		for(j = 0; j <= r; ++j)
			val += (d[ri++]! & 255) - fv,
			v = Math.round(val * ia), d[ti++] = v + (v << 8) + (v << 16) + OCMax;
		for(j = r + 1; j < w - r; ++j)
			val += (d[ri++]! & 255) - (d[li++]! & 255),
			v = Math.round(val * ia), d[ti++] = v + (v << 8) + (v << 16) + OCMax;
		for(j = w - r; j < w; ++j)
			val += lv - (d[li++]! & 255),
			v = Math.round(val * ia), d[ti++] = v + (v << 8) + (v << 16) + OCMax;
	}
}
function boxBlurT4(d: Uint32Array, w: number, h: number, r: number) {
	const ia = 1 / (r + r + 1);
	let i = 0, ti, li, ri, fv, lv, val, j, v;
	for(; i < w; ++i) {
		ti = i, li = ti, ri = ti + r * w, fv = d[ti]! & 255;
		lv = d[ti + w * (h - 1)]! & 255, val = (r + 1) * fv;
		for(j = 0; j < r; ++j) val += d[ti + j * w]! & 255;
		for(j = 0; j <= r; ++j)
			val += (d[ri]! & 255) - fv, v = Math.round(val * ia),
			d[ti] = v + (v << 8) + (v << 16) + OCMax, ri += w, ti += w;
		for(j = r + 1; j < h - r; ++j)
			val += (d[ri]! & 255) - (d[li]! & 255), v = Math.round(val * ia),
			d[ti] = v + (v << 8) + (v << 16) + OCMax, li += w, ri += w, ti += w;
		for(j = h - r; j < h; ++j)
			val += lv - (d[li]! & 255), v = Math.round(val * ia),
			d[ti] = v + (v << 8) + (v << 16) + OCMax, li += w, ti += w;
	}
}

//---------------------------------------- User Interface ----------------------------------------

function ioInit(type: string, con: (id: string) => void, dCon: () => void) {
	Sck = ioConnect();
	ioReset();
	function ioReset() {
		Sck.removeAllListeners();
		Sck.on('type', () => Sck.emit('type', type, QData['tkn'], SData.id));
		Sck.on('badTkn', () => {
			utils.remCookie('uid');
			statusMsg(`Bad Token\nPlease launch Formbot via Nova Labs Automations using the appropriate WAUtils page for your class.`);
		});
		Sck.on('connection', (id, ver) => {
			Sck.on('disconnect', () => (dCon && dCon(), ioReset()));
			if(SData.v && SData.v !== ver) location.reload(); //Update available
			VId.textContent = SData.v = ver;
			console.log('Connected', ver);
			utils.setCookie('uid', id, 4 * 3600);
			con(SData.id = id);
			SData.c = true;
		});
	}
}

onload = () => {
	SData.id = utils.getCookie('uid');
	QData = utils.fromQuery(location.search);
	console.log('Run test with %ctest()', 'background:#000;color:#db0');
	DS = document.body.style, BDF = 'backdropFilter' in DS;
	initLayout(), initBg(), statusMsg('Connecting...');
	ioInit('form', () => { //Connect
		statusMsg();
		if(!SData.c) { //First time
			if(QData['id']) {
				FAdc.value = 'p';
				(FAdc.onchange as any)();
				FTitle.value = QData['id'] as string;
				getEv();
			}
		}
		Sck.on('ack', (ev: string, ok, res) => {
			console.log(`ACK ${ev}:`, ok, res);
			if(!ok) { //Error
				showInfo('Server Error', res || 'Unknown Error');
				if(ev === 'sendForm') rstForm(true);
				else if(ev === 'getEvent') genEvent(null, res);
			} else if(ev === 'sendForm') {
				showInfo('Form submitted successfully.', 0, 'rgba(0,150,20,.8)');
			} else if(ev === 'getEvent') try {
				genEvent(res);
			} catch(e) {showInfo('Event Error', e)}
		});
	}, () => { //Disconnect
		statusMsg('Connection To Server Lost!');
		rstForm(true);
	});
};

function initLayout() {
	Hdr.textContent = FormType;
	utils.setDateTime(FDate, new Date());
	utils.numField(FCount, 0, 200);
	utils.numField(FRate, 0, 100), FRate.set(30);
	utils.numField(FCost, 0, undefined, undefined, '$');
	utils.numField(FMatCost, 0, undefined, undefined, '$');
	FCount.onblur = () => {
		const n = FCount.num + 1;
		if(n) {
			while(n > ATbl.childElementCount) layoutMakeRow();
			while(n < ATbl.childElementCount) layoutRemRow();
		}
	};
	//Form Interaction
	FAdc.onchange = () => {
		EIN.textContent = FAdc.value === 'a' || EvData ? 'Name' : 'ID';
		const p = FAdc.value === 'p';
		FAdc.parentElement!.hidden = FTitle.disabled = p && !!EvData;
		FType.disabled = FDate.disabled = FCost.disabled = p;
		ClsData.hidden = false;
	};
	(FPay.onchange = (e: any) => {
		if(e) FDonate.checked = FPay.value === 'don';
	})(1);
	FCost.onnuminput = () => {
		const v = FCost.num;
		for(const a of ATbl.children) a._p?.set(v);
		if(v < 15) showInfo('Warning: Price Below $15. (You must clear this with the board!)');
		else InfoBox.textContent = '';
	};
	FMatCost.onnuminput = () => {
		FMatFiles.parentElement!.hidden = !FMatCost.num;
	};
	FDonate.onchange = () => {
		FPay.value = FDonate.checked ? 'don' : 'adp';
		(FPay.onchange as any)();
	};
	for(const f of document.getElementsByClassName('field')) {
		f.addEventListener('focus', rstForm);
		charPat(f as HTMLInputElement, f);
	}
	//Event Autofill
	FTitle.onkeyup = e => e.key === 'Enter' && getEv();
	FTitle.oninput = e => (e.inputType === 'insertFromPaste' || !e.inputType) && getEv();
	MuReject.onclick = () => {
		if(MuMatch.firstChild) MuMatch.firstChild.remove();
		MuReject.hidden = true, EvData = null, FTitle.value = '';
		(FAdc.onchange as any)();
	};
	//Submit
	SBtn.onclick = async () => {
		if(PdfSub) return;
		try {
			if(FAdc.value !== 'a' && !EvData) throw 'Please Enter ID';
			if(PdfData) {
			//Fade out submit button
				const ss = SBtn.style;
				ss.transition = 'opacity .5s ease-out', ss.opacity = 0, PdfSub = false;
				setTimeout(() => ss.opacity || (ss.display = 'none'), 550);
				//Upload & submit
				showInfo('Uploading Receipts...', 0, 'rgba(0,150,200,.8)');
				if(await sendReceipts()) return;
				showInfo('Submitting Data...', 0, 'rgba(0,150,200,.8)');
				const t = FType.value;
				Sck.emit('sendForm', FTitle.n, utils.formatDate(utils.getDateTime(FDate)), FName.value,
					FMail.value, FMatCost.num, PdfData, SData.sl, t === 'ssn' ? 2 : t === 'sgn' ? 1 : 0);
			} else { //Generate PDF
				genPdf();
				showInfo('Generated PDF Preview! Please Press Submit.', 0, 'rgba(0,150,200,.8)');
				SBtn.textContent = 'Submit PDF';
			}
		} catch(e) {showInfo('Form Error:', e)}
	};
}

function charPat(f: HTMLInputElement, pe: Element) {
	const p = pe.getAttribute('charPattern');
	if(!p) return;
	const r = new RegExp(p);
	f.addEventListener('keypress', e => {
		if(e.key.length === 1 && !r.test(e.key)) e.preventDefault();
	});
}

function getEv() {
	if(FAdc.value !== 'p' || !(Number(FTitle.value) > 0)) return;
	showInfo('Loading...'), Sck.emit('getEvent', FTitle.value);
}

const SEL = '<option selected>---</option>\
<option>No Show</option>\
<option>Youth Under 18</option>\
<option>Youth Robotics</option>\
<option>Makerschool</option>\
<option>Paid Using Donate Online</option>\
<option>Do Not Sign Off</option>';

function rowInput(row: HTMLElement) {
	const i = utils.mkEl('input', utils.mkEl('td', row));
	i.type = 'text', i.autocomplete = 'off', i.onfocus = rstForm;
	return i;
}
function layoutMakeRow() {
	const row = utils.mkEl('tr', ATbl) as ATblRow;
	charPat(row._n = rowInput(row), FName);
	row._m = rowInput(row);
	row._x = utils.mkEl('select', utils.mkEl('td', row), 'field', null, SEL);
	row._x.onfocus = rstForm;
	row._p = utils.numField(rowInput(row), 0, undefined, undefined, '$');
}
function layoutRemRow() {ATbl.lastChild!.remove()}

function rstForm(f?: Event | true) {
	if(f === true) PdfSub = false;
	else {
		if(PdfSub) return;
		SBtn.textContent = 'Preview Summary';
		InfoBox.textContent = '';
		PdfData = null;
	}
	const ss = SBtn.style;
	ss.display = ss.opacity = '';
}

function genEvent(ev: EventData | null, e?: string) {
	EvData = ev, MuMatch.innerHTML = '', MuReject.hidden = false;
	const box = utils.mkDiv(MuMatch, 'muEvent');
	if(e || !ev) return box.innerHTML = `<b>Error:</b> ${e}`;
	rstForm();
	//Info
	const t = utils.mkEl('a', box, 'muTitle'), i = utils.mkDiv(box, 'muDetail'),
		v = utils.mkEl('a', i, 'muVen'), l = utils.mkDiv(i, 'muSub'), d = utils.mkDiv(i, 'muDesc');
	t.href = ev.link, t.target = '_blank', t.textContent = ev.name, v.textContent = ev.ven, v.href = ev.link,
	v.target = '_blank', l.textContent = ev.loc, d.textContent = ev.desc;
	//Meta
	const m = utils.mkDiv(box, 'muMeta');
	utils.mkDiv(m, 'muSub', {marginBottom: '6px'}, '100% Match');
	utils.mkDiv(m, null, null, ev.time);
	utils.mkDiv(m, 'muSub', null, ev.date);
	utils.mkDiv(m, 'muRSVP', null, ev.yes + ' Attendees<br>' + ev.wait + ' Waitlist');
	utils.mkDiv(m, null, {marginTop: 6}, ev.fee);
	//Hosts
	const hl = utils.mkDiv(box, 'muHosts');
	let hc = 'Hosted By: ';
	ev.hosts.forEach((h, i) => hc += `${i ? ', ' : ''}<a href='${ev.link}' target='_blank' class=muVen>${h.name}</a>`);
	hl.innerHTML = hc, FTitle.value = ev.name;
	const ln = ev.name.toLowerCase(), date = new Date(ev.dRaw);
	utils.setDateTime(FDate, date);
	//Apply event
	const nCont = (s: string) => ln.indexOf(s) !== -1;
	FName.value = ev.hosts[0]!.name;
	FAdc.value = 'p';
	FCost.set(ev.fRaw);
	FCount.set(ev.yes);
	(FCount.onblur as any)();
	const r = ev.rsvp, ac = ATbl.children;
	if(r.length >= ac.length) throw 'RSVP Count Mismatch';
	for(let i = 0, l = r.length, u, s; i < l; ++i) {
		u = r[i]!, s = ac[i + 1]!;
		s._n.value = u.name;
		s._m.value = u.level || 'None';
		s._p.set(u.fee);
	}
	if(nCont('safety')) FType.value = 'ssn';
	else if(nCont('_s') || nCont('sign-off') || nCont('sign off')) FType.value = 'sgn';
	else FType.value = 'mkr';
	(FAdc.onchange as any)();
}

async function sendReceipts() {
	if(!FMatCost.num) return;
	try {
		const fl = FMatFiles.files!, fHdr = [], fDat = [];
		let f, b, l, len = 0;
		console.log('Files', fl);
		//Read data
		for(f of fl) {
			b = await f.bytes(), l = b.byteLength;
			fHdr.push({n: f.name, t: f.type, l});
			fDat.push(b), len += l;
		}
		//Parse to binary
		const hdr = new TextEncoder().encode(JSON.stringify(fHdr));
		f = new Uint32Array([l = hdr.byteLength]), l += 4;
		const data = new Uint8Array(l + len);
		data.set(new Uint8Array(f.buffer));
		data.set(hdr, 4);
		for(f of fDat) data.set(f, l), l += f.byteLength;
		//Upload
		const r = await fetch(new Request(`/upload?id=${SData.id}`, {method: 'POST', body: data}));
		f = await r.text();
		if(r.status !== 200 || f !== 'OK') {
			f = utils.mkDiv(null, null, null, f).textContent;
			throw `Error ${r.status}: ${f}`;
		}
		console.log('Files uploaded!');
	} catch(e) {
		showInfo('File Upload', e);
		return 1;
	}
}

//---------------------------------------- PDF Generator ----------------------------------------

const cTitle = '#111133', cMain = '#405555', cData = '#8888aa',
	cSub = '#c05545', cMail = '#0065ee', xOff = .2;

function genPdf() {
	FTitle.n = FTitle.value + (FAdc.value === 'a' ? ' [ADHOC]' : '');
	const fT = FTitle.n, fD = utils.formatDate(utils.getDateTime(FDate)),
		fN = FName.value, fP = selBoxValue(FPay), fM = FMail.value, fY = FType.value,
		fS = FCount.num, fMC = FMatCost.num, fR = FRate.num;

	//Error checking
	if(!fP) throw 'Payment Type';
	if(!fT) throw 'Class Name';
	if(!FDate.value) throw 'Class Date';
	if(!fN) throw 'Instructor Name';
	if(!fM) throw 'Instructor Email';
	if(!fY) throw 'Class Type';
	if(!fS || fS < 0) throw 'Students Count';
	if(!(fMC >= 0)) throw 'Material Cost';
	if(fR < 0 || fR > 100) throw 'NovaLabs Rate';

	//Read Attendee List
	const ac = ATbl.children;
	SData.sl = [];
	let rt = 0;
	if(ac.length - 1 !== fS) throw 'List Size must equal Student Count';
	for(let i = 1, l = ac.length, s, n, m, x; i < l; ++i) {
		s = ac[i]!, n = s._n.value, m = s._m.value, x = s._x;
		if(!n) throw `Attendee List [${i - 1}]`;
		SData.sl.push([n, x.options.selectedIndex ? ` (${selBoxValue(x)})` : '', m, s._p.value]);
		rt += s._p.num;
	}

	const pdf = new jsPDF({orientation: 'portrait', unit: 'in', format: [8.5, 11]});
	function pdfLine(y: number, name: string, val: string, c?: string) {
		pdf.setFontSize(24), pdf.setTextColor(cMain), pdf.text(name + ':', xOff, y);
		pdf.setFontSize(20), pdf.setTextColor(c || cData), pdf.text(val, xOff + 2.2, y);
	}
	function multiColor(y: number, ...args: any[]) {
		for(let i = 0, l = args.length, c, t, off = xOff; i + 1 < l; i += 2) {
			c = args[i], t = String(args[i + 1]);
			pdf.setTextColor(c), pdf.text(t, off, y);
			off += pdf.getTextWidth(t);
		}
	}

	//Class Info
	pdf.setFontSize(40), pdf.setTextColor(cTitle);
	pdf.text(FormType, 8.5 / 2, .7, {align: 'center'});
	pdfLine(1.5, 'Class Name', fT);
	pdfLine(2, 'Date', fD);
	pdfLine(2.5, 'Type', selBoxValue(FType)!);
	pdfLine(3.5, 'Instructor', fN, '#000000');
	pdfLine(4, 'Payment', fP);
	pdfLine(4.5, 'Email', fM, cMail);

	//Cost Breakdown
	const p = utils.formatCost(rt - fMC), t = (rt - fMC) * ((100 - fR) / 100) + fMC, tt = utils.formatCost(t);
	//Revenue
	pdf.setFontSize(20);
	if(fMC > 0) multiColor(5.5, cData, utils.formatCost(rt), cSub, ' Revenue - ',
		cData, utils.formatCost(fMC), cSub, ' Materials = ', cData, p, cSub, ' Profit');
	else multiColor(5.5, cData, fS, cSub, ' Paid Students = ', cData, p, cSub, ' Class Revenue');
	//Income
	multiColor(5.9, cData, p, cSub, ' - ', cMain, '(' + fR + '% NL Rate)',
		cSub, fMC > 0 ? ' + Materials = ' : ' = ', cData, tt, cSub, ' Income');
	if(FPay.value === 'don') multiColor(6.3, cData, tt, cSub, ' Donated to Nova Labs');
	else multiColor(6.3, cData, tt, cSub, ' Payable to Instructor');
	//Step 3. Profit!
	multiColor(10.7, cSub, '( Revenue - ', cData, tt, cSub, ' = ',
		cMain, utils.formatCost(rt - t) + ' Nova Labs Profit', cSub, ' )');

	//Attendee List
	pdf.addPage(), pdf.setFontSize(40), pdf.setTextColor(cTitle);
	pdf.text('Attendee List', 8.5 / 2, .7, {align: 'center'});
	pdf.setFontSize(20), pdf.setTextColor(cMain);
	pdf.text('Name', xOff, 1.4);
	pdf.text('Membership', 4.4, 1.4);
	pdf.text('Payment', 8.5 - xOff, 1.4, {align: 'right'});
	pdf.setFontSize(15);
	for(let i = 0, l = SData.sl.length, off = 1.75, s; i < l; ++i, off += .25) {
		s = SData.sl[i]!;
		multiColor(off, cTitle, `${i + 1}. ${s[0]}`, '#ee0000', s[1]);
		pdf.setTextColor(cMail);
		pdf.text(s[2], 4.6, off);
		pdf.setTextColor(cTitle);
		if(s[3]) pdf.text(s[3], 8.5 - xOff, off, {align: 'right'});
	}

	const f = utils.mkDiv(document.body, 'pdf');
	utils.mkDiv(f, 'pdfExit', null, 'PDF Preview <i>(Click to exit)</i>');
	utils.mkEl('iframe', f, null, {border: 'none', flex: 'auto'}).src = pdf.output('datauristring');
	DS.overflow = 'hidden';
	f.onclick = () => (f.remove(), DS.overflow = '');
	PdfData = pdf.output();
}

//---------------------------------------- Misc. Functions ----------------------------------------

function statusMsg(msg?: string) {
	Status.firstChild!.textContent = msg || '';
	ContBox.hidden = StatMsg = !(Status.hidden = !msg);
}
function showInfo(msg: string, err?: any, bg?: string) {
	if(err) console.error(msg, err), msg += ` ${err}`;
	else console.info(msg);
	InfoBox.textContent = msg;
	if(!bg) bg = 'rgba(150,20,0,.8)';
	if(BDF) bg = bg.slice(0, bg.lastIndexOf(',') + 1) + '.5)';
	const es = InfoBox.style;
	es.background = bg, es.transition = '', es.opacity = 0;
	setTimeout(() => (es.transition = 'opacity .5s ease-out', es.opacity = 1), 0);
}
const selBoxValue = (sb: HTMLSelectElement) => sb.selectedOptions[0]?.text;

//---------------------------------------- Form Test ----------------------------------------

window.test = () => {
	Hdr.textContent = FormType.replace('Form', 'Test');
	const ev: EventData = {
		id: 420,
		name: `TST_S: How To Do Things 102`,
		desc: `This is a NovaLabs WA Test event which teaches individuals how to do the stuff and things. This is an introductory class, so please no advanced students. Also, no children ages 12 or below, and no adults 25 or up. We won't be accepting teenagers either, so please leave your teens at home parents! In fact, we may not be taking any humans at all. If you are or know a human, this is not the class for you. You know what, just life in general really is not welcome... But other than that, be sure to come and bring your kids! PS: Sorry for the dead memes.`,
		link: 'https://cataas.com/cat/gif',
		ven: 'Nova Labs',
		loc: 'Your Imagination',
		fRaw: 69,
		fee: '$69.00',
		dRaw: '1994-03-21T16:20',
		date: 'Mar 21st, 1994',
		time: '4:20 PM',
		wait: 0,
		hosts: [{name: 'John Doe', email: 'test@example.com', id: 0, fee: 0, h: true}],
		rsvp: [
			{name: 'Tony Hock - Pro Scooter', email: 'a@example.com', id: 5321, fee: 69, h: false, _x: 0},
			{name: 'PewDiePie', email: 'b@example.com', id: 100000000, fee: 0, h: false, _x: 3},
			{name: 'Product Placement', email: 'c@example.com', id: 4853, fee: 69, h: false, _x: 2},
			{name: 'Sum Ting Wong', email: 'd@example.com', id: 5607, fee: 69, h: false, _x: 6},
			{name: 'Fakus Namecus-Esquire III', email: 'e@example.com', id: 7080, fee: 69, h: false, _x: 0}
		],
		yes: 5
	};
	genEvent(ev);
	FPay.value = 'adp', (FPay.onchange as any)();
	ATbl.children.each((a: ATblRow, i) => {
		a._x.selectedIndex = ev.rsvp[i - 1]!._x!;
	}, 1);
	FMail.value = ev.hosts[0]!.email;
	FAdc.value = 'a';
	FMatCost.set(42.5);
	scrollTo(0, 9999);
	statusMsg();
	return 'EXECUTING TEST...';
};