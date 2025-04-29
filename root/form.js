//Instructor Form ©2022 Pecacheu. GNU GPL v3.0

'use strict';
let FormType="Instructor Formbot";
let DB, DS, BDF, Socket={}, QData, StatMsg, PdfData, PdfSub, EvData;

//---------------------------------------- Background Animation ----------------------------------------

const BgSize=400, BgSpd=10/1000, OCMax=255<<24;
let Blur,bgPos=0,bSkp=0,bTs,bgGPU;

window.onblur = () => {Blur=1}
window.onfocus = () => {Blur=0}

function initBg() {
	bgBox.i=new Image(); bgBox.i.src='resources/bg.svg';
	bgBox.c=bgBox.getContext('2d',{alpha:true}); bgBox.c.imageSmoothingEnabled=false;
	bgGPU=utils.mobile; window.onresize=bgScale; window.onscroll=() => {bSkp=1};
	bgScale(); requestAnimationFrame(bgRun);
}

function bgRun() {
	if(!StatMsg) if(bSkp == 1) {
		bSkp=0; let t=performance.now();
		bgPos=utils.norm(bgPos + BgSpd*(bTs?t-bTs:0),-400,0), bTs=t;
		let p=utils.norm(bgPos+(scrollY/4),-400,0);
		//Tiles:
		let ctx=bgBox.c, r=bgBox.r; ctx.setTransform(r,0,0,r,0,0);
		let w=bgBox.w,h=bgBox.h,bw=w+BgSize,bh=h+BgSize,x,y;
		for(y=0; y<bh; y+=BgSize) for(x=0; x<bw; x+=BgSize) ctx.drawImage(bgBox.i,p+x,p+y);
		//Gradient Fill:
		w*=r,h*=r; let sx=1,sy=1; if(w>h) ctx.scale(1,sy=h/w); else ctx.scale(sx=w/h,1);
		let gw=w/sx,gh=h/sy, w2=gw/2,h2=gh/2, g=ctx.createRadialGradient(w2,h2,0,w2,h2,w>h?w:h);
		g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(0.8,'rgba(0,0,0,.9');
		ctx.fillStyle=g; ctx.fillRect(0,0,gw,gh);
		//Blur:
		if(!bgGPU) { //Software Blur - Uses CPU, runs better on desktop.
			let b=contentBox.boundingRect, bX=Math.floor(b.x*r), bY=Math.floor(b.y*r), bW=Math.floor(b.width*r), bH=Math.floor(b.height*r),
			px=ctx.getImageData(bX,bY,bW,bH); boxBlur4(px.data,bW,bH,12); ctx.putImageData(px,bX,bY);
		}
	} else if(!Blur) bSkp++;
	requestAnimationFrame(bgRun);
}

function bgScale(f) {
	let w=utils.w, h=utils.h, dw=bgBox.w-w, dh=bgBox.h-h, r=(devicePixelRatio||1)/2; if(r<1) r=1;
	if(f!=1 && bgBox.r==r && dw>=0 && dw<300 && dh>=0 && dh<300) return;
	let s=bgBox.style; w+=50,h+=50; s.width=bgBox.w=w, s.height=bgBox.h=h,
	bgBox.width=w*r, bgBox.height=h*r, bgBox.r=r;
	//Hardware Blur - Better for GPU-optimized mobile browsers.
	if(bgGPU) contentBox.style.backdropFilter=contentBox.style.webkitBackdropFilter='blur(8px)';
	else contentBox.style.backdropFilter=contentBox.style.webkitBackdropFilter=null;
}

//Thanks to: http://blog.ivank.net/fastest-gaussian-blur.html
function boxBlur4(d,w,h,r) { d=new Uint32Array(d.buffer); boxBlurH4(d,w,h,r); boxBlurT4(d,w,h,r); }
function boxBlurH4(d,w,h,r) {
	let ia=1/(r+r+1),i,ti,li,ri,fv,lv,val,j,v;
	for(i=0; i<h; i++) {
		ti=i*w, li=ti, ri=ti+r, fv=d[ti]&255, lv=d[ti+w-1]&255, val=(r+1)*fv;
		for(j=0; j<r; j++) val += d[ti+j]&255;
		for(j=0; j<=r; j++) { val += (d[ri++]&255)-fv; v=Math.round(val*ia); d[ti++]=v+(v<<8)+(v<<16)+OCMax; }
		for(j=r+1; j<w-r; j++) { val += (d[ri++]&255)-(d[li++]&255); v=Math.round(val*ia); d[ti++]=v+(v<<8)+(v<<16)+OCMax; }
		for(j=w-r; j<w; j++) { val += lv-(d[li++]&255); v=Math.round(val*ia); d[ti++]=v+(v<<8)+(v<<16)+OCMax; }
	}
}
function boxBlurT4(d,w,h,r) {
	let ia=1/(r+r+1),i,ti,li,ri,fv,lv,val,j,v;
	for(i=0; i<w; i++) {
		ti=i, li=ti, ri=ti+r*w, fv=d[ti]&255, lv=d[ti+w*(h-1)]&255, val=(r+1)*fv;
		for(j=0; j<r; j++) val += d[ti+j*w]&255;
		for(j=0; j<=r; j++) { val += (d[ri]&255)-fv; v=Math.round(val*ia); d[ti]=v+(v<<8)+(v<<16)+OCMax; ri+=w,ti+=w; }
		for(j=r+1; j<h-r; j++) { val += (d[ri]&255)-(d[li]&255); v=Math.round(val*ia); d[ti]=v+(v<<8)+(v<<16)+OCMax; li+=w,ri+=w,ti+=w; }
		for(j=h-r; j<h; j++) { val += lv-(d[li]&255); v=Math.round(val*ia); d[ti]=v+(v<<8)+(v<<16)+OCMax; li+=w,ti+=w; }
	}
}

//---------------------------------------- User Interface ----------------------------------------

function ioInit(t, con, dCon, idx) {
	Socket=io.connect(); ioReset();
	function ioReset() {
		Socket.removeAllListeners(); Socket.id=null;
		Socket.on('type', () => {Socket.emit('type',t,QData.tkn)});
		Socket.on('badTkn', () => {
			statusMsg("Bad Token\nPlease launch Formbot via Nova Labs Automations using the appropriate WAUtils page for your class.");
		});
		Socket.on('connection', (id,ver) => {
			Socket.on('disconnect', () => {if(dCon) dCon(); ioReset()});
			Socket.on('id', id => {Socket.id=id; if(idx) idx(id)});
			if(vId.v && vId.v != ver) location.reload(); vId.v=ver;
			console.log("Connected",vId.textContent=ver);
			con(Socket.id=id); Socket.c=1;
		});
	}
}

window.onload = formLoad;
function formLoad() {
	QData=utils.fromQuery(location.search);
	console.log("Run test with %ctest()",'background:#000;color:#db0');
	DB=document.body, DS=DB.style, BDF='backdropFilter' in DS;
	initLayout(); initBg(); statusMsg("Connecting...");
	ioInit('form', () => { //Connect:
		statusMsg(); if(!Socket.c) { //First:
			if(QData.id) {
				fAdc.value='p'; fAdc.onchange();
				fTitle.value=QData.id; getEv();
			}
		}
		Socket.on('ack', (ev, stat, e) => {
			console.log("ACK "+(stat?'true':'false')+": "+ev,e?e:'');
			if(!stat) { //Server-side errors:
				showInfo("Server Error: '"+(e||'{UNKNOWN}')+"'");
				if(ev == 'sendForm') { //Form error:
					let ss=sButton.style; ss.display=ss.opacity=null, PdfSub=0;
				} else if(ev == 'getEvent') genEvent(null,e);
			} else if(ev == 'sendForm') {
				showInfo("Form submitted successfully.", 'rgba(0,150,20,0.8)');
			} else if(ev == 'getEvent') genEvent(e);
		});
	}, () => { //Disconnect:
		statusMsg("Connection To Server Lost!");
		let ss=sButton.style; ss.display=ss.opacity=null, PdfSub=0;
	});
}

function initLayout() {
	header.textContent=FormType; fDate.value=utils.toDateTimeBox(new Date());
	utils.numField(fCount,0,50); utils.numField(fRate,0,100); fRate.set(30);
	utils.numField(fCost,null,null,null,'$'); utils.numField(fMatCost,null,null,null,'$');
	fCount.onblur = () => {
		let n=fCount.num+1; if(n) {
			while(n > aTable.childElementCount) layoutMakeRow();
			while(n < aTable.childElementCount) layoutRemRow();
		}
	}
	//Form Interaction:
	fAdc.onchange = () => {
		Ein.textContent = fAdc.value=='a'||EvData?"Name":"ID";
		let p=fAdc.value=='p'; fAdc.parentNode.hidden=fTitle.disabled=p&&EvData;
		fType.disabled=fDate.disabled=fCost.disabled=p; clsData.hidden=0;
	}
	(fPay.onchange = () => {
		Pem.textContent = (fPay.value=='pap'?"PayPal ":'')+"Email";
	})();
	fCost.onnuminput = () => {
		let v=fCost.num, a=aTable.children;
		for(let i=1,l=a.length; i<l; i++) a[i].children[3].firstChild.set(v);
		if(v<15) showInfo("Warning: Price Below $15. (You must clear this with the board!)");
		else infoBox.textContent='';
	}
	let fd=document.getElementsByClassName('field');
	for(let i=0,l=fd.length,f; i<l; i++) {
		(f=fd[i]).addEventListener('focus',rstForm);
		charPat(f, f.getAttribute('charPattern'));
	}
	//Event Autofill:
	fTitle.onkeypress = (e) => {if(e.key == 'Enter') getEv()}
	fTitle.oninput = (e) => {if(e.inputType == 'insertFromPaste' || !e.inputType) getEv()}
	muReject.onclick = () => {
		if(muMatch.firstChild) muMatch.firstChild.remove();
		muReject.hidden=1; EvData=null; fTitle.value=''; fAdc.onchange();
	}
	//Submit:
	sButton.onclick = () => {
		if(PdfSub) return;
		if(fAdc.value!='a' && !EvData) return showInfo("Error: Please Enter ID");
		if(PdfData) { //Submit:
			let t=fType.value; showInfo("Submitting Data...", 'rgba(0,150,200,0.8)');
			Socket.emit('sendForm', fTitle.n, utils.formatDate(utils.fromDateTimeBox(fDate)),
				fName.value, fMail.value, fMatCost.num, PdfData, aTable.sl, t=='ssn'?2:(t=='sgn'?1:0));
			//Fade out submit button:
			let ss=sButton.style; ss.transition='opacity 0.5s ease-out', ss.opacity=0;
			setTimeout(() => {if(!ss.opacity) ss.display='none'}, 550); PdfSub=1;
		} else { //Generate PDF:
			let e=genPdf(); if(e) return showInfo("Form Error: "+e);
			showInfo("Generated PDF Preview! Please Press Submit.", 'rgba(0,150,200,0.8)');
			sButton.textContent="Submit PDF";
		}
	}
}
function charPat(f,p) {
	if(!p) return;
	p=new RegExp(p); f.addEventListener('keypress',e => {
		let k=e.key; if(k.length==1 && !p.test(k)) e.preventDefault();
	});
}

function getEv() {
	if(fAdc.value!='p' || !(Number(fTitle.value)>0)) return;
	showInfo("Loading..."); Socket.emit('getEvent',fTitle.value);
}

const SEL = "<select class=field>\
	<option selected>---</option>\
	<option>No Show</option>\
	<option>Youth Under 18</option>\
	<option>Youth Robotics</option>\
	<option>Makerschool</option>\
	<option>Paid Using Donate Online</option>\
	<option>Do Not Sign Off</option>\
</select>";

function layoutMakeRow() {
	let r=utils.mkEl('tr'), nf=utils.mkEl('td',r,'usrn',null,"<input type=text onfocus=rstForm() autocomplete=off>").firstChild;
	charPat(nf, fName.getAttribute('charPattern'));
	utils.mkEl('td',r,null,null,"<input type=text style=text-align:center onfocus=rstForm() autocomplete=off>");
	utils.mkEl('td',r,null,{textAlign:'center'},SEL);
	let f=utils.numField(utils.mkEl('input',utils.mkEl('td',r,'user')),null,null,null,'$');
	f.set(0); f.onfocus=rstForm; aTable.appendChild(r);
}
function layoutRemRow() { aTable.lastElementChild.remove(); }

function rstForm() {
	if(PdfSub) return;
	PdfData=0, sButton.textContent="Preview Summary", infoBox.textContent='';
	let ss=sButton.style; ss.display=ss.opacity=null;
}

function genEvent(ev,e) {
	EvData=ev; muMatch.innerHTML=''; muReject.hidden=0;
	const box=utils.mkDiv(muMatch,'muEvent'); if(e) return box.innerHTML="<b>Error:</b> "+e;
	rstForm();
	//Info:
	let t=utils.mkEl('a',box,'muTitle'), i=utils.mkDiv(box,'muDetail'),
	v=utils.mkEl('a',i,'muVen'), l=utils.mkDiv(i,'muSub'), d=utils.mkDiv(i,'muDesc');
	t.href=ev.link, t.target='_blank', t.textContent=ev.name, v.textContent=ev.ven, v.href=ev.link,
	v.target='_blank', l.textContent=ev.loc, d.textContent=ev.desc;
	//Meta:
	let m=utils.mkDiv(box,'muMeta');
	utils.mkDiv(m,'muSub',{marginBottom:'6px'},"100% Match");
	utils.mkDiv(m,null,null,ev.time); utils.mkDiv(m,'muSub',null,ev.date);
	utils.mkDiv(m,'muRSVP',null,ev.yes+" Attendees<br>"+ev.wait+" Waitlist");
	utils.mkDiv(m,null,{marginTop:6},ev.fee);
	//Hosts:
	let hl=utils.mkDiv(box, 'muHosts'), hc="Hosted By: ";
	for(let i=0,l=ev.hosts.length; i<l; i++) hc += (i?', ':'')+"<a href='"
		+ev.link+"' target='_blank' class='muVen'>"+ev.hosts[i].name+"</a>";
	hl.innerHTML=hc; fTitle.value=ev.name; ev._ln=ev.name.toLowerCase();
	fDate.value=utils.toDateTimeBox(ev.d=new Date(ev.dRaw));
	evApply(); fAdc.onchange();
}
const nCont=s => EvData._ln.indexOf(s)!=-1;
function evApply() {
	fTitle.value=EvData.name, fDate.value=utils.toDateTimeBox(EvData.d);
	let h=EvData.hosts[0]; fName.value=h.name; fAdc.value='p';
	fCost.set(EvData.fRaw); fCount.set(EvData.yes);
	fCount.onblur(); let r=EvData.rsvp, a=aTable.children;
	if(r.length >= a.length) return showInfo("Error: RSVP Count Mismatch");
	for(let i=0,l=r.length,u,s; i<l; i++) {
		u=r[i],s=a[i+1].children; s[0].firstChild.value=u.name,
		s[1].firstChild.value=u.level||"None", s[3].firstChild.set(u.fee);
	}
	if(nCont("_t") || nCont("safety")) fType.value='ssn';
	else if(nCont("_s") || nCont("sign-off") || nCont("sign off")) fType.value='sgn';
	else fType.value='mkr';
}

//---------------------------------------- PDF Generator ----------------------------------------

const cTitle='#111133', cMain='#405555', cData='#8888aa',
cSub='#c05545', cMail='#0065ee', xOff=0.2;

function genPdf() {
	fTitle.n = fTitle.value+(fAdc.value=='a'?" [ADHOC]":'');
	let fT=fTitle.n, fD=utils.formatDate(utils.fromDateTimeBox(fDate)),
	fN=fName.value, fP=selBoxValue(fPay), fM=fMail.value, fY=fType.value,
	fS=fCount.num, fMC=fMatCost.num, fR=fRate.num;

	//Error checking:
	if(!fP) return "Payment Type"; if(!fT) return "Class Name";
	if(!fDate.value) return "Class Date"; if(!fN) return "Instructor Name";
	if(!fM) return "Instructor Email"; if(!fY) return "Class Type";
	if(!fS || fS<0) return "Students Count"; if(!(fMC>=0)) return "Material Cost";
	if(fR<0 || fR>100) return "NovaLabs Rate";

	//Read Attendee List:
	let a=aTable.children,sl=[],rt=0; aTable.sl=sl;
	if(a.length-1 !== fS) return "List Size must equal Student Count";
	for(let i=1,l=a.length,s,n,r,u,p; i<l; i++) {
		s=a[i].children; n=s[0].firstChild.value, u=s[1].firstChild.value,
		r=s[2].firstChild, p=s[3].firstChild; if(!n) return "Attendee List ["+(i-1)+"]";
		sl.push([n,r.options.selectedIndex?' ('+selBoxValue(r)+')':'',u,p.value]); rt+=p.num;
	}

	const pdf = new jsPDF({orientation:'portrait', unit:'in', format:[8.5,11]});
	function pdfLine(y,name,val,c) {
		pdf.setFontSize(24); pdf.setTextColor(cMain); pdf.text(xOff,y,name+':');
		pdf.setFontSize(20); pdf.setTextColor(c||cData); pdf.text(xOff+2.2,y,val);
	}
	function multiColor(y) {
		for(let i=1,l=arguments.length,c,t,off=xOff; i+1<l; i+=2) {
			c=arguments[i], t=String(arguments[i+1]);
			pdf.setTextColor(c); pdf.text(off,y,t);
			off += pdf.getTextWidth(t);
		}
	}

	//Class Info:
	pdf.setFontSize(40); pdf.setTextColor(cTitle);
	pdf.text(8.5/2,0.7,FormType,null,null,'center');
	pdfLine(1.5,'Class Name',fT); pdfLine(2,'Date',fD);
	pdfLine(2.5,'Type',selBoxValue(fType));
	pdfLine(3.5,'Instructor',fN,'#000000');
	pdfLine(4,'Payment',fP);
	pdfLine(4.5,'Email',fM,cMail);

	//Cost Breakdown:
	let p=utils.formatCost(rt-fMC), t=(rt-fMC)*((100-fR)/100)+fMC, tt=utils.formatCost(t);
	//Revenue:
	pdf.setFontSize(20);
	if(fMC>0) multiColor(5.5,cData,utils.formatCost(rt),cSub," Revenue - ",
	cData,utils.formatCost(fMC),cSub," Materials = ",cData,p,cSub," Profit");
	else multiColor(5.5,cData,fS,cSub," Paid Students = ",cData,p,cSub," Class Revenue");
	//Reimbursement:
	multiColor(5.9,cData,p,cSub," - ",cMain,"("+fR+"% NL Rate)",
	cSub,(fMC>0)?" + Materials = ":" = ",cData,tt,cSub," Reimbursement");
	//Step 3. Profit!
	multiColor(10.7,cSub,"( Revenue - ",cData,tt,cSub," = ",
	cMain,utils.formatCost(rt-t)+" Nova Labs Profit",cSub," )");

	//Attendee List:
	pdf.addPage(); pdf.setFontSize(40); pdf.setTextColor(cTitle);
	pdf.text(8.5/2,0.7,"Attendee List",null,null,'center');
	pdf.setFontSize(20); pdf.setTextColor(cMain);
	pdf.text(xOff,1.4,"Name"); pdf.text(4.4,1.4,"Membership");
	pdf.text(8.5-xOff,1.4,"Payment",null,null,'right');
	pdf.setFontSize(15);
	for(let i=0,l=sl.length,off=1.75,s; i<l; i++,off+=0.25) {
		s=sl[i]; multiColor(off,cTitle,(i+1)+'. '+s[0],"#ee0000",s[1]);
		pdf.setTextColor(cMail); pdf.text(4.6,off,s[2].toString());
		pdf.setTextColor(cTitle);
		if(s[3]) pdf.text(8.5-xOff,off,s[3],null,null,'right');
	}

	let f=utils.mkDiv(DB,'pdf'); utils.mkDiv(f,'pdfExit',null,"PDF Preview <i>(Click to exit)</i>");
	let d=utils.mkEl('iframe',f,null,{border:'none',flex:'auto'}); DS.overflow='hidden';
	d.src = pdf.output('datauristring'); f.onclick = () => { f.remove(); DS.overflow=null; }
	PdfData = pdf.output();
}

//---------------------------------------- Misc. Functions ----------------------------------------

function statusMsg(msg) {
	statusText.textContent = msg||""; statusBg.hidden = !msg;
	contentBox.hidden = StatMsg = !!msg;
}
function showInfo(msg, bg) {
	console.info(msg); infoBox.textContent=msg;
	if(!bg) bg='rgba(150,20,0,0.8)'; if(BDF) bg=bg.substr(0,bg.lastIndexOf(',')+1)+'0.5)';
	let es=infoBox.style; es.background=bg, es.transition=null, es.opacity=0;
	setTimeout(() => { es.transition='opacity 0.5s ease-out', es.opacity=1; },0);
}
function selBoxValue(sb) {let o=sb.selectedOptions; return o[0]?o[0].text:null}

//---------------------------------------- Form Test ----------------------------------------

window.test = () => {
	FormType=FormType.replace('Form','Test'), header.textContent=FormType;
	let desc = "This is a NovaLabs WA Test event which teaches individuals how to do the stuff and things. This is an introductory class, so please no advanced students. Also, no children ages 12 or below, and no adults 25 or up. We won't be accepting teenagers either, so please leave your teens at home parents! In fact, we may not be taking any humans at all. If you are or know a human, this is not the class for you. You know what, just life in general really is not welcome... But other than that, be sure to come and bring your kids! PS: Sorry for the dead memes.", ev = {name:"TST_S: How To Do Things 102",id:'lol',link:"https://cataas.com/cat/gif",ven:"Nova Labs",loc:"Your Imagination",fRaw:69,fee:"$69.00",dRaw:"1994-03-21T16:20",wait:0,desc:desc,hosts:[{name:"John Doe",email:"test@example.com",id:0}]};
	ev.rsvp = [
		{name:"Tony Hock - Pro Scooter",id:5321,fee:69,ti:0},
		{name:"PewDiePie",id:100000000,fee:0,ti:3},
		{name:"Product Placement",id:4853,fee:69,ti:2},
		{name:"Sum Ting Wong",id:5607,fee:69,ti:6},
		{name:"Fakus Namecus-Esquire III",id:7080,fee:69,ti:0},
	];
	ev.yes=ev.rsvp.length; genEvent(ev); fPay.value='pap'; fPay.onchange();
	for(let i=1,a=aTable.children,l=a.length; i<l; i++) a[i].children[2].firstChild.selectedIndex=ev.rsvp[i-1].ti;
	fMail.value=ev.hosts[0].email, fAdc.value='a', fMatCost.set(42.5);
	scrollTo(0,9999); statusMsg();
	return "EXECUTING TEST...";
}