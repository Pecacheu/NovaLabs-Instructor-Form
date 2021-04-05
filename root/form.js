//Instructor Form, Copyright (©) 2021 Bryce Peterson (pecacheu@gmail.com); GNU GPL v3.0

'use strict';
let FormType="Instructor Formbot";
let DB, DS, BDF, Socket={}, StatMsg, PdfData, PdfSub, EvData;

//---------------------------------------- Background Animation ----------------------------------------

const BgSize=400, BgSpd=15/1000, OCMax=255<<24;
let Blur,bgPos=0,bSkp=0,bTs,bgGPU;

window.onblur = () => {Blur=1}
window.onfocus = () => {Blur=0}

function initBg() {
	bgBox.i=new Image(); bgBox.i.src='resources/bg.svg';
	bgBox.c=bgBox.getContext('2d',{alpha:true}); bgBox.c.imageSmoothingEnabled=false;
	bgGPU=utils.mobile; window.onresize=bgScale; window.onscroll=() => {bSkp=2};
	bgScale(); requestAnimationFrame(bgRun);
}

function bgRun() {
	if(!StatMsg) if(bSkp == 2) {
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
	utils.updateSize(); let w=utils.width, h=utils.height, dw=bgBox.w-w, dh=bgBox.h-h,
	r=(window.devicePixelRatio||1)/2; if(r<1) r=1;
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
		Socket.on('type', () => {Socket.emit('type',t)});
		Socket.on('connection', (id,ver) => {
			Socket.on('disconnect', () => { if(dCon) dCon(); ioReset(); });
			Socket.on('id', id => { Socket.id=id; if(idx) idx(id); });
			console.log("Connected",vId.textContent=ver);
			con(Socket.id=id);
		});
	}
}

window.onload = () => {
	console.log("Run test with %ctest()",'background:#000;color:#db0');
	DB=document.body, DS=DB.style, BDF='backdropFilter' in DS;
	initLayout(); initBg(); statusMsg("Connecting...");
	ioInit('form', () => { //Connect:
		statusMsg();
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
	utils.costField(fCost); utils.costField(fMatCost);
	fCount.onblur = () => {
		let n=fCount.num+1; if(n) {
			while(n > aTable.childElementCount) layoutMakeRow();
			while(n < aTable.childElementCount) layoutRemRow();
		}
	}
	//Form Interaction:
	fPay.onchange = () => {
		pem.textContent = (fPay.value=='pap'?"PayPal ":'')+"Email";
		fDon.parentNode.hidden = (fPay.value!='don');
	}
	fCost.onnuminput = () => {
		let v=fCost.num, a=aTable.children;
		for(let i=1,l=a.length; i<l; i++) a[i].children[3].firstChild.set(v);
	}
	let fd=document.getElementsByClassName('field');
	for(let i=0,l=fd.length,f; i<l; i++) {
		f=fd[i]; f.addEventListener('focus',rstForm);
		//if(f.num != null) f.onnuminput=doCostBreakdown; //////////////////////////// COST BREAKDOWN??
		let p=f.getAttribute('charPattern'); if(p) { //RegEx Parse:
			p=new RegExp(p); f.onkeypress = e => {
				let k=e.key; if(k.length != 1) return;
				if(!p.test(k)) e.preventDefault();
			}
		}
	}
	/*//Update cost breakdown system on membership-type change:
	fType.onchange = function() {
		const v = this.value, vc = (v == 'cus'), vm = (v == 'min'); let r=30;
		fRate.par.hidden = !vc; fCount.par.hidden = fMatCost.par.hidden = vm;
		fCostText.textContent = vm?'Payment':'Cost/Student';
		if(vm) { fCount.set(1); fMatCost.set(0); r=0; }
		fRateInfo.textContent = (vc?'Negotiated':r+'%')+' NovaLabs Rate'; fRate.set(r);
	}*/
	//Event Autofill:
	fTitle.oninput = () => {
		if(Number(fTitle.value) > 0) Socket.emit('getEvent',fTitle.value);
	}
	muReject.onclick = () => {
		if(muMatch.firstChild) muMatch.firstChild.remove();
		muReject.hidden=muApply.hidden=1; EvData=null;
	}
	muApply.onclick = () => {
		if(!EvData) return;
		fTitle.value=EvData.name, fDate.value=utils.toDateTimeBox(EvData.d);
		let h=EvData.hosts[0]; fName.value=h.name, fMail.value=h.email;
		fAdc.selectedIndex=0; fCost.set(EvData.fRaw); fCount.set(EvData.yes);
		fCount.onblur(); let r=EvData.rsvp, a=aTable.children;
		if(r.length != a.length-1) return showInfo("Error: RSVP Mismatch");
		for(let i=1,l=a.length,u,s; i<l; i++) {
			u=r[i-1],s=a[i].children; s[0].firstChild.value=u.name,
			s[1].firstChild.value=u.id, s[3].firstChild.set(u.fee);
		}
	}
	//Submit:
	sButton.onclick = () => {
		if(PdfSub) return;
		if(PdfData) { //Submit:
			let t=fType.value; showInfo("Submitting Data...", 'rgba(0,150,200,0.8)');
			Socket.emit('sendForm', fTitle.n, utils.formatDate(utils.fromDateTimeBox(fDate)),
				fName.value, fMail.value, PdfData, aTable.sl, t=='ssn'?2:(t=='sgn'?1:0));
			//Fade out submit button:
			let ss=sButton.style; ss.transition='opacity 0.5s ease-out', ss.opacity=0;
			setTimeout(() => { if(!ss.opacity) ss.display='none'; }, 550);
			PdfSub=1;
		} else { //Generate PDF:
			let e=genPdf(); if(e) return showInfo("Form Error: "+e);
			showInfo("Generated PDF Preview! Please Press Submit.", 'rgba(0,150,200,0.8)');
			sButton.textContent = "Submit PDF";
		}
	}
}

const SEL = "<select class='field'>\
	<option selected>---</option>\
	<option>No Show</option>\
	<option>No GO</option>\
	<option>Paid Using Donate Online</option>\
	<option>Minor 8-11</option>\
	<option>Minor 12-15</option>\
	<option>Minor 16-17</option>\
	<option>Do Not Sign Off</option>\
	<option>Incomplete</option>\
	<option>Safety Sign Off Only</option>\
	<option>No NL Account</option>\
</select>";

function layoutMakeRow() {
	let r=utils.mkEl('tr');
	utils.mkEl('td',r,'name',null,"<input type='text' onfocus='rstForm()'>");
	utils.mkEl('td',r,null,null,"<input type='number' onfocus='rstForm()' pattern='\d*'>");
	utils.mkEl('td',r,null,{textAlign:'center'},SEL);
	let f=utils.costField(utils.mkEl('input',utils.mkEl('td',r,'user')));
	f.set(fCost.num); f.onfocus=rstForm; aTable.appendChild(r);
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
	//Info:
	let t=utils.mkEl('a',box,'muTitle'), i=utils.mkDiv(box,'muDetail'),
	v=utils.mkEl('a',i,'muVen'), l=utils.mkDiv(i,'muSub'), d=utils.mkDiv(i,'muDesc');
	t.href=ev.link, t.target='_blank', t.textContent=ev.name, v.textContent=ev.ven, v.href=ev.link,
	v.target='_blank', l.textContent=ev.loc, d.textContent=ev.desc;
	//Meta:
	let m=utils.mkDiv(box,'muMeta'), ac=utils.mkDiv(m,'muSub'), tt=utils.mkDiv(m), td=utils.mkDiv(m,'muSub'),
	rs=utils.mkDiv(m,'muRSVP'), dt=utils.formatDate(ev.d=new Date(ev.dRaw)), ds=dt.indexOf(' ',6);
	tt.textContent=dt.substr(0,ds), td.textContent=dt.substr(ds+1), rs.innerHTML=ev.yes+" Attendees<br>"
		+ev.wait+" Waitlist", ac.style.marginBottom='6px', ac.textContent="100% Match";
	utils.mkDiv(m,null,{marginTop:6}).textContent=ev.fee;
	//Hosts:
	let hl=utils.mkDiv(box, 'muHosts'), hc="Hosted By: ";
	for(let i=0,l=ev.hosts.length; i<l; i++) hc += (i?', ':'')+"<a href='"
		+ev.link+"' target='_blank' class='muVen'>"+ev.hosts[i].name+"</a>";
	hl.innerHTML=hc; fTitle.value=ev.name;
	fDate.value=utils.toDateTimeBox(ev.d);
	muApply.hidden=0;
}

/*//Show current fee total:
function doCostBreakdown() { if(!pdfSub) {
	const charge=fCost.num, sNum=fCount.num, mats=fMatCost.num, rate=fRate.num;
	let text='', color='rgba(0,150,200,0.8)';
	if(charge < 15) {
		text = "Warning: "+utils.formatCost(charge)+" is too low! Minimum class fee eligible for reimbursement is $15.00!";
		color = 'rgba(200,160,0,0.8)';
	} else {
		const r = charge*sNum, p = utils.formatCost(r-mats), t = (r-mats)*((100-rate)/100)+mats;
		text = "Class Profit: "+utils.formatCost(charge)+" Charge x "+sNum+" Students - "+utils.formatCost(mats)+" Materials = "+p
		+"\nTotal Reimbursement: "+p+" - "+rate+"% Rate + Materials = "+utils.formatCost(t);
		if(r-t <= 0 && fType.value != 'min') {
			text += "\nWarning: NovaLabs makes "+utils.formatCost(r-t)+"! Please ensure you've coordinated this with the board!";
			color = 'rgba(200,160,0,0.8)';
		} else if(mats >= t) {
			text += "\nWarning: Your class did not make any profit! You may still submit your form.";
			color = 'rgba(200,160,0,0.8)';
		} else if(mats) text += "\nNote: Materials cost is for tax purposes only.";
	}
	showInfo(text, color);
}}*/

//---------------------------------------- PDF Generator ----------------------------------------

const cTitle='#111133', cMain='#405555', cData='#8888aa',
cSub='#c05545', cMail='#0065ee', xOff=0.2;

function genPdf() {
	fTitle.n = fTitle.value+(fAdc.value?" ADHOC":'');
	let fT=fTitle.n, fD=utils.formatDate(utils.fromDateTimeBox(fDate)),
	fN=fName.value, fP=selBoxValue(fPay), fF=fDon.value, fM=fMail.value, fC=fCost.num,
	fY=fType.value, fS=fCount.num, fMC=fMatCost.num, fR=fRate.num;

	//Error checking:
	if(!fP || typeof fP != 'string') return "Payment Type";
	if(fPay.value == 'don' && !fF) return "Donation To";
	if(!fT) return "Class Name"; if(!fDate.value) return "Class Date";
	if(!fN) return "Instructor Name"; if(!fM) return "Instructor Email";
	if(!fY) return "Class Type"; if(!fC || fC<15) return "Cost Per Student";
	if(!fS || fS<0) return "Students Count"; if(!(fMC>=0)) return "Material Cost";
	if(fR<0 || fR>100) return "NovaLabs Rate";

	//Read Attendee List:
	let a=aTable.children, sl=[]; aTable.sl=sl;
	if(a.length-1 !== fS) return "List Size must equal Student Count";
	for(let i=1,l=a.length,s,n,r,u,p; i<l; i++) {
		s=a[i].children; n=s[0].firstChild.value, u=Number(s[1].firstChild.value)||0,
		r=s[2].firstChild, p=s[3].firstChild; if(!n) return "Attendee List ["+(i-1)+"]";
		sl.push([n+(r.options.selectedIndex?' ('+selBoxValue(r)+')':''),u,p.value]);
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
	pdfLine(3,'Instructor',fN,'#000000');
	pdfLine(3.5,'Payment',fF?"Donation ("+fF+")":fP);
	pdfLine(4,'Email',fM,cMail);

	//Cost Breakdown:
	let r=fC*fS, p=utils.formatCost(r-fMC), t=(r-fMC)*((100-fR)/100)+fMC, tt=utils.formatCost(t);
	//Revenue:
	pdf.setFontSize(20);
	if(fMC>0) multiColor(5,cData,utils.formatCost(fC),cSub," x ",cData,fS,cSub," Students - ",
	cData,utils.formatCost(fMC),cSub," Materials = ",cData,p,cSub," Class Profit");
	else multiColor(5,cData,utils.formatCost(fC),cSub," x ",cData,fS,cSub," Students = ",
	cData,p,cSub," Class Profit");
	//Reimbursement:
	multiColor(5.4,cData,p,cSub," - ",cMain,"("+fR+"% NL Rate)",
	cSub,(fMC>0)?" + Materials = ":" = ",cData,tt,cSub," Reimbursement");
	//Step 3. Profit!
	multiColor(10.8,cSub,"( Revenue - ",cData,tt,cSub," = ",
	cMain,utils.formatCost(r-t)+" NovaLabs Profit",cSub," )");

	//Attendee List:
	if(sl && sl.length) {
		pdf.addPage(); pdf.setFontSize(40); pdf.setTextColor(cTitle);
		pdf.text(8.5/2,0.7,"Attendee List",null,null,'center');
		pdf.setFontSize(20); pdf.setTextColor(cMain);
		pdf.text(xOff,1.4,"Name"); pdf.text(4.7,1.4,"ID");
		pdf.text(8.5-xOff,1.4,"Payment",null,null,'right');
		pdf.setFontSize(15); pdf.setTextColor(cTitle);
		for(let i=0,l=sl.length,off=1.75,s; i<l; i++,off+=0.25) {
			s=sl[i]; pdf.text(xOff,off,(i+1)+'. '+s[0]); pdf.setTextColor(cMail);
			pdf.text(4.6,off,s[1].toString()); pdf.setTextColor(cTitle);
			if(s[2]) pdf.text(8.5-xOff,off,s[2],null,null,'right');
		}
	}

	let f=utils.mkDiv(DB,'pdf'); utils.mkDiv(f,'pdfExit',null,"PDF Preview <i>(Click to exit)</i>");
	let d=utils.mkEl('iframe',f,null,{border:'none',flex:'auto'}); DS.overflow='hidden';
	d.src = pdf.output('datauristring'); f.onclick = () => { f.remove(); DS.overflow=null; }
	PdfData = pdf.output();
}

//---------------------------------------- Misc. Functions ----------------------------------------

function statusMsg(msg) {
	statusText.textContent = msg||null; statusBg.hidden = !msg;
	contentBox.hidden = StatMsg = !!msg;
}
function showInfo(msg, bg) {
	console.info(msg); infoBox.textContent=msg;
	if(!bg) bg='rgba(150,20,0,0.8)'; if(BDF) bg=bg.substr(0,bg.lastIndexOf(',')+1)+'0.5)';
	let es=infoBox.style; es.background=bg, es.transition=null, es.opacity=0;
	setTimeout(() => { es.transition='opacity 0.5s ease-out', es.opacity=1; },0);
}

function selBoxValue(sb) {
	let op=sb.options, l=op[op.selectedIndex];
	if(!l) return null; return l.label;
}

//---------------------------------------- Form Test ----------------------------------------

window.test = function() {
	FormType=FormType.replace('Form','Test'), header.textContent=FormType;
	let desc = "This is a NovaLabs WA Test event which teaches individuals how to do the stuff and things. This is an introductory class, so please no advanced students. Also, no children ages 12 or below, and no adults 25 or up. We won't be accepting teenagers either, so please leave your teens at home parents! In fact, we may not be taking any humans at all. If you are or know a human, this is not the class for you. You know what, just life in general really is not welcome... But other than that, be sure to come and bring your kids! PS: Sorry for the dead memes.", ev = {name:"How To Do Things 102",id:'lol',link:"https://cataas.com/cat/gif",ven:"Nova Labs",loc:"Your Imagination",fRaw:69,fee:"$69.00",dRaw:"1994-03-21T16:20",wait:0,desc:desc,hosts:[{name:"John Doe",email:"test@example.com",id:0}]};

	ev.rsvp = [
		{name:"Tony Hock - Pro Scooter",id:5321,fee:69,ti:0},
		{name:"PewDiePie",id:100000000,fee:0,ti:3},
		{name:"Product Placement",id:4853,fee:69,ti:2},
		{name:"Ng Wai Chung",id:5607,fee:69,ti:7},
		{name:"Fakus Namecus-Esquire III",id:7080,fee:69,ti:0},
	];

	ev.yes=ev.rsvp.length; genEvent(ev); muApply.onclick(); fPay.value='pap'; fPay.onchange(); fType.value='sgn';
	for(let i=1,a=aTable.children,l=a.length; i<l; i++) a[i].children[2].firstChild.selectedIndex=ev.rsvp[i-1].ti;
	window.scrollTo(0,9999); return "EXECUTING TEST...";
}