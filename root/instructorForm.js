//This work is licensed under a GNU General Public License, v3.0. Visit http://gnu.org/licenses/gpl-3.0-standalone.html for details.
//Instructor Form, Copyright (�) 2017 Bryce Peterson (Nickname: Pecacheu, Email: Pecacheu@gmail.com)

"use-strict";
let FORM_TYPE = "Instructor Reimbursement Form";

//---------------------------------------- Background Animation ----------------------------------------

const BG_SIZE = 400, SPEED = 15, FPS = 30,
bgTiles = [], moveAmt = Math.ceil(SPEED/FPS*100)/100;
let bgBox, skip = false, bgPos = 0, bgSize = 0;

//Init & Start Animation:
function initBg() {
	bgBox = document.createElement('div'); const s = bgBox.style;
	s.position = 'fixed'; s.left = s.top = 0; s.zIndex = -1;
	makeTiles(true); document.body.appendChild(bgBox);
	requestAnimationFrame(bgAnimate);
}

//Animate Grid & Replace Old Tiles:
function bgAnimate() { if(skip && !statMsg) {
	skip = false; const w=utils.width, h=utils.height;
	if((bgPos += moveAmt) >= 0) { console.warn("SHIFTED TILES"); bgPos -= 400; }
	const pos = utils.normalize(bgPos+(scrollY/4),-400,0);
	if(utils.mobile) { const s = bgBox.style; s.left = s.top = pos; }
	else bgBox.style.transform = 'translate('+pos+'px,'+pos+'px)';
} else skip = true; requestAnimationFrame(bgAnimate); }

//Generate Tile Grid:
function makeTiles(force) {
	utils.updateSize(); const w=utils.width+BG_SIZE, h=utils.height+BG_SIZE;
	if(!force && bgBox.bWidth >= w && bgBox.bHeight >= h) return;
	//Clear tile grid & Make new tiles:
	function makeTile(x,y) {
		const o=document.createElement('img'), s=o.style; o.src = 'resources/bg.svg';
		s.position = 'absolute'; s.left = x; s.top = y; bgBox.appendChild(o); bgTiles.push(o);
	}
	while(bgBox.hasChildNodes()) bgBox.removeChild(bgBox.firstChild);
	let x,y; for(y=0; y<h; y+=BG_SIZE) for(x=0; x<w; x+=BG_SIZE) makeTile(x,y);
	bgBox.bWidth = x; bgBox.bHeight = y; console.warn("TILE RESIZE "+x+"x"+y);
}

//---------------------------------------- User Interface ----------------------------------------

let pdfData = null, pdfSubmit = false, EventMatch = null;

function layoutMakeRow() {
	const r = utils.mkEl('tr');
	utils.mkEl('td',r,'name',null,"<input type='text' onfocus='resetPreview()'/>");
	utils.mkEl('td',r,'mail',null,"<input type='email' onfocus='resetPreview()' value='unknown@meetup.com'/>");
	utils.mkEl('td',r,'user',null,"<input type='number' onfocus='resetPreview()' pattern='\d*'/>");
	aTable.appendChild(r);
}
function layoutRemRow() { aTable.lastElementChild.remove(); }

//Reset preview-status on form interaction:
function resetPreview() { if(!pdfSubmit) {
	pdfData = null; sButton.textContent = "Preview Summary";
	if(this.num == null || !infoBox.textContent.startsWith('Class')) { //If not number field or number status isn't shown.
		const ss = sButton.style; ss.display = null; ss.opacity = 1;
		infoBox.textContent = ''; infoBox.style.opacity = 0;
	}
}}

//Show current fee total:
function doCostBreakdown() { if(!pdfSubmit) {
	//const len=Number(fLen.value);
	const charge=fCost.num, sNum=fCount.num, mats=fMatCost.num, rate=fRate.num;
	let text = '', color = 'rgba(0,150,200,0.8)';
	if(charge < 15) {
		text = "Warning: "+utils.formatCost(charge)+" is too low! Minimum class fee eligible for reimbursement is $15.00!";
		color = 'rgba(200,160,0,0.8)';
	} else {
		const r = charge*sNum, rev = utils.formatCost(r), t = r*((100-rate)/100), total = utils.formatCost(t);
		text = "Class Revenue: "+utils.formatCost(charge)+" Charge x "+sNum+" Students = "+rev
		+"\nTotal Reimbursement: "+rev+" - "+rate+"% Rate = "+total;
		if(r-t <= 0) {
			text += "\nWarning: NovaLabs makes "+utils.formatCost(r-t)+"! Please ensure you've coordinated this with the board!";
			color = 'rgba(200,160,0,0.8)';
		} else if(t-mats <= 0) {
			text += "\nWarning: Your class did not make any profit! You may still submit your form.";
			color = 'rgba(200,160,0,0.8)';
		} else text += "\nNote: Materials cost is for tax purposes only.";
	}
	showInfo(text, color);
}}

function initLayout() {
	//Setup field defaults & input parsing types:
	header.textContent = FORM_TYPE; fDate.value = utils.toDateTimeBox(new Date());
	utils.numField(fCount, 0, 200); utils.numField(fRate, 0, 100);
	fRate.set(30); utils.costField(fCost); utils.costField(fMatCost);
	//Update attendee table size on students count change:
	fCount.onblur = function() {
		let num = Number(this.value); if(num >= 0) { num++;
			while(num > aTable.childElementCount) layoutMakeRow();
			while(num < aTable.childElementCount) layoutRemRow();
		}
	}
	//Update meetup event matches on class date change:
	let mSearch = false; fDate.oninput = fTitle.oninput = function() {
		if(mSearch) return; mSearch = true;
		findMeetup(fTitle.value, utils.fromDateTimeBox(fDate).getTime(), function(event, accuracy, err) {
			const evBox = showMeetup(event, accuracy, err);
			if(muMatch.firstChild) muMatch.firstChild.replaceWith(evBox); else muMatch.appendChild(evBox);
			muHeader.hidden = muReject.hidden = false; mSearch = false;
		});
	}
	muReject.onclick = function() {
		if(muMatch.firstChild) muMatch.firstChild.remove();
		muHeader.hidden = muReject.hidden = true; EventMatch = null;
	}
	//Update cost breakdown system on membership-type change:
	fType.onchange = function() {
		const v = this.value; fRate.par.hidden = (v != 'cus');
		if(v == 'cus') r = 40; else if(v == 'mkr') r = 30; else if(v == 'sgn') r = 20; else r = 40;
		fRateInfo.textContent = (v=='cus'?'Negotiated':r+'%')+' NovaLabs Rate'; fRate.set(r);
	}
	//Add onupdate & onfocus functions to fields:
	const fields = document.getElementsByClassName('field');
	for(let f=0,field,l=fields.length; f<l; f++) {
		field = fields[f]; field.addEventListener('focus', resetPreview);
		if(field == fCost || field == fCount || field == fMatCost || field == fRate) {
			field.onnuminput = doCostBreakdown; //Cost breakdown update function.
		}
		//RegEx Pattern rejection for Normal Field Types:
		const tp = field.getAttribute('charPattern');
		if((field.type == 'text' || field.type == 'email') && tp) {
			const p = new RegExp(tp);
			field.onkeypress = function() {
				const k = event.key; if(k.length != 1) return;
				if(!p.test(k)) event.preventDefault();
			}
		}
		field.par  = field.parentElement; //Cache current parent element.
		if(utils.mobile) utils.skinnedInput(field); //TODO: Better way to determine if device has support for custom input skin?
	}
	//Preview/Submit button press:
	sButton.onclick = function() {
		if(!pdfData) { //Preview.
			const err = doPreview(); if(typeof err == 'string') { showInfo("Form Error: "+err); return; }
			//const ign = err?" (Ignored Attendee List due to missing values.)":'';
			showInfo("Generated PDF Preview! Please Press Submit.", 'rgba(0,150,200,0.8)');
			sButton.textContent = "Submit PDF";
		} else doSubmit(); //Submit.
	}
}

/*function numField(field, min, max) {
	field.value = field.num = Number(field.value)||0; field.oninput = function() {
		let val = Number(this.value); if(!val && val != 0) this.value = val = this.num; else {
			if(val < min) val = min; else if(val > max) val = max; else val = Math.floor(val);
			this.value = this.num = val;
		}
		if(this.onnuminput) this.onnuminput(val);
	}
	field.set = function(n) { n = Number(n)||0; this.value = this.num = n; }
}

function costField(field) {
	field.ns = ''; field.num = 0; field.value = '$0.00'; field.onkeydown = function() {
		const k = event.keyCode; if(k == 8 || k == 46) this.ns = this.ns.substr(0,this.ns.length-1);
		else if(k >= 48 && k <= 57) this.ns += (k-48); else if(k >= 96 && k <= 105) this.ns += (k-96);
		const n = Number(this.ns)||0; this.value = utils.formatCost(n); event.preventDefault();
		this.num = n; if(this.onnuminput) this.onnuminput(n);
	}
	field.set = function(n) {
		n = Number(n)||0; this.num = n; this.value = utils.formatCost(n); this.ns = n.toString();
	}
}*/

//Generate an event info box that looks like the Meetup website style:
function showMeetup(event, accuracy, err) {
	const box = document.createElement('div'); box.className = 'muEvent';
	//Error checking:
	if(err) { box.innerHTML = "<b>Error:</b> "+err; return box; }
	if(!event) { box.innerHTML = "<b>No Matches Found!</b>"; return box; }
	//Event info:
	const title = utils.mkEl('a', box, 'muTitle'), info = utils.mkDiv(box, 'muDetail'),
	ven = utils.mkEl('a', info, 'muVen'), loc = utils.mkDiv(info, 'muSub'), desc = utils.mkDiv(info, 'muDesc');
	title.href = event.link; title.target = '_blank'; title.textContent = event.name;
	ven.textContent = event.venue.name; ven.href = event.link; ven.target = '_blank';
	let addr = event.venue.address_1, asub = addr.substr(0,10);
	if(asub == '1916 Isaac' || asub == '1916 Issac') addr = "NovaLabs";
	loc.textContent = addr+", "+event.venue.city+", "+(event.venue.state||event.venue.country);
	desc.innerHTML = event.description; desc.textContent = desc.textContent; //Strip HTML.
	//Event meta:
	const meta = utils.mkDiv(box, 'muMeta'), match = utils.mkDiv(meta, 'muSub'), time = utils.mkDiv(meta),
	date = utils.mkDiv(meta, 'muSub'), rsvp = utils.mkDiv(meta, 'muRSVP');
	const evDate = utils.formatDate(new Date(event.time)), dSep = evDate.indexOf(' ',6);
	time.textContent = evDate.substr(0,dSep); date.textContent = evDate.substr(dSep+1);
	rsvp.innerHTML = event.yes_rsvp_count+" Attendees<br>"+event.waitlist_count+" Waitlist";
	if(accuracy) { match.style.marginBottom = '6px'; match.textContent = accuracy+" Match"; }
	//Event fee:
	if(event.fee) {
		const fee = utils.mkDiv(meta), feeDesc = utils.mkDiv(meta, 'muSub'); fee.style.marginTop = 6;
		fee.textContent = utils.formatCost(event.fee.amount); feeDesc.textContent = event.fee.description;
	}
	//Event hosts:
	const eh = event.event_hosts, ehEm = []; if(eh.length) {
		const hosts = utils.mkDiv(box, 'muHosts'); let hostHTML = "Hosted By: ";
		for(let i=0,h,l=eh.length; i<l; i++) {
			h = eh[i]; hostHTML += (i===0?'':', ')+"<a href='https://meetup.com/"+event.
			group.urlname+"/members/"+h.id+"' target='_blank' class='muVen'>"+h.name+"</a>";
			ehEm[i] = [h.name,h.id];
		}
		hosts.innerHTML = hostHTML;
	}
	EventMatch = {name:event.name, link:event.link, loc:loc.textContent, ven:event.venue.name,
	desc:desc.textContent, acc:accuracy, time:time.textContent, date:date.textContent,
	yes:event.yes_rsvp_count, wait:event.waitlist_count, hosts:ehEm, gid:event.group.urlname};
	if(event.fee) { EventMatch.fee = utils.formatCost(event.fee.amount); EventMatch.feeDesc = event.fee.description; }
	return box;
}

//---------------------------------------- PDF Generator ----------------------------------------

//Show PDF Preview:
function doPreview() {
	const title=fTitle.value, name=fName.value, date=utils.formatDate(utils.fromDateTimeBox(fDate)), email=fMail.value,
	charge=fCost.num, sNum=fCount.num, mats=fMatCost.num, rate=fRate.num, pm=selBoxValue(fPay);
	//Error checking:
	if(!title) return "Class Name"; if(!fDate.value || !date) return "Class Date";
	if(!name) return "Instructor Name"; if(!email) return "Instructor Email";
	if(!charge || charge < 15) return "Cost Per Student";
	if(!sNum || sNum < 0) return "Students Count";
	if(!(mats >= 0)) return "Material Cost is undefined!?";
	if(!rate || rate < 0) return "NovaLabs Rate";
	if(!pm || typeof pm != 'string') return "Payment Type is undefined!?";
	const aNodes=aTable.children; if(aNodes.length !== sNum+1) return "Attendee List size must equal Student Count";
	//Read Attendee List:
	const sList=[]; for(let i=1,l=aNodes.length,sub; i<l; i++) {
		sub = aNodes[i].children; if(sub.length !== 3) return "Attendee List, Child "+i+": Column count must be 3!";
		const name=sub[0].firstChild.value, mail=sub[1].firstChild.value, user=Number(sub[2].firstChild.value)||0;
		if(name && mail) sList.push([name,mail,user]);
	}
	if(sList.length != aNodes.length-1) return "Attendee List! (Only user IDs are optional)";
	//Generate PDF:
	const pdf = genPDF(title, date, name, email, charge, sNum, mats, rate, pm, sList);
	pdfData = [title,date,name,email,pdf,sList];
}

//Submit PDF:
function doSubmit() { if(pdfData && !pdfSubmit) {
	//Send emial with PDF attachment:
	socket.emit('sendToAccounting', pdfData[0], pdfData[1], pdfData[2],
	pdfData[3], pdfData[4], 'pdf', pdfData[5], EventMatch, fType.value=='sgn');
	showInfo("Submitting Data...", 'rgba(0,150,200,0.8)');
	//Fade out submit button:
	const ss = sButton.style; ss.transition = 'opacity 0.5s ease-out'; ss.opacity = 0;
	setTimeout(function() { if(ss.opacity == 0) ss.display = 'none'; }, 500);
	pdfSubmit = true;
}}

//Generate PDF Document:
function genPDF(className, date, iName, email, charge, sNum, mats, rate, payment, sList) {
	const pdf = new jsPDF({orientation:'portrait', unit:'in', format:[8.5,11]});
	
	const cTitle = '#111133', cMain = '#405555', cData = '#8888aa',
	cSub = '#c05545', cMail = '#0065ee', xOff = 0.2;
	
	function pdfLine(y, name, value, color) {
		pdf.setFontSize(24); pdf.setTextColor(cMain); pdf.text(xOff,y,name+':');
		pdf.setFontSize(20); pdf.setTextColor(color||cData); pdf.text(xOff+2.2,y,value);
	}
	
	function multiColor(y/*, {...}*/) {
		for(let i=1,l=arguments.length,color,text,off=xOff; i+1<l; i+=2) {
			color = arguments[i]; text = String(arguments[i+1]);
			pdf.setTextColor(color); pdf.text(off,y,text);
			off += pdf.getTextWidth(text);
		}
	}
	
	//Title:
	pdf.setFontSize(40); pdf.setTextColor(cTitle);
	pdf.text(8.5/2,0.7,FORM_TYPE,null,null,'center');
	
	//Class Info:
	pdfLine(1.5, 'Class Name', className); pdfLine(2, 'Date', date);
	pdfLine(3, 'Instructor', iName, '#000000'); pdfLine(3.5, 'Email', email, cMail);
	pdfLine(4, 'Payment', payment);
	
	//Cost Breakdown:
	const r = charge*sNum, rev = utils.formatCost(r),
	t = r*((100-rate)/100), total = utils.formatCost(t);
	
	//Revenue:
	pdf.setFontSize(20);
	multiColor(5,cData,utils.formatCost(charge),cSub," x ",cData,
	sNum,cSub," Students = ",cData,rev,cSub," Class Revenue");
	//Reimbursement:
	multiColor(5.4,cData,rev,cSub," - ",cMain,"("+rate+"% NL Rate)",
	cSub," = ",cData,total,cSub," Reimbursement");
	if(mats > 0) multiColor(6.2,cMain,"Materials: ",cData,utils.formatCost(mats));
	//Step 3. Profit!
	multiColor(10.8,cSub,"( ",cData,rev,cSub," - ",cData,total,
	cSub," = ",cMain,utils.formatCost(r-t)+" NovaLabs Profit",cSub," )");
	
	//Attendee List:
	if(sList && sList.length) {
		pdf.addPage(); const mPos = (8.5/6)*2;
		pdf.setFontSize(40); pdf.setTextColor(cTitle);
		pdf.text(8.5/2,0.7,"Attendee List",null,null,'center');
		
		pdf.setFontSize(20); pdf.setTextColor(cMain);
		pdf.text(xOff,1.4,"Name"); pdf.text(mPos,1.4,"Email");
		pdf.text(8.5-xOff,1.4,"Meetup ID",null,null,'right');
		
		pdf.setFontSize(15); pdf.setTextColor(cTitle);
		for(let i=0,l=sList.length,off=1.75,item; i<l; i++) {
			item = sList[i];
			pdf.text(xOff,off,(i+1)+'. '+item[0]); pdf.setTextColor(cMail);
			pdf.text(mPos,off,item[1]); pdf.setTextColor(cTitle);
			if(item[2]) pdf.text(8.5-xOff,off,item[2].toString(),null,null,'right');
			off += 0.25;
		}
	}
	if(/Edge\/|Trident\/|MSIE /.test(navigator.userAgent)) { //IE or Edge:
		pdf.save(className.replace(/\s/g,'')+'_localCopy.pdf'); //Save Local Copy.
	} else window.open(pdf.output('datauri')); //Preview In-browser Using Data URI.
	return pdf.output();
}

//---------------------------------------- Misc. Functions ----------------------------------------

const DAY_MS = 86400000, WEEK_MS = DAY_MS*7,
EventsListURI = 'https://api.meetup.com/NOVA-Makers/events?desc=true&scroll=recent_past&sig_id=51259412&status'+
'=past&fields=event_hosts&sig=4a302259f6902a81ea95ae216b2591d636d96a6b'; let supportsBdf = false, meetupEvents;

function findMeetup(name, time, callback) {
	if(typeof time != 'number' || time <= 0) return "Invalid Search Time/Date!";
	if(typeof callback != 'function') return "Callback must be function!";
	function process(data) {
		if(data.data) data = data.data;
		if(!data || !Array.isArray(data) || data.errors) {
			meetupEvents = false; if(data && Array.isArray(data.errors)) {
				const e = data.errors[0]; callback(null,null,e.code+': '+e.message);
			} else if(data === false) callback(null,null,"Timed out!");
			else callback(null,null,"Invalid/Null response!"); return;
		}
		const events = data, eNameMatch = [], eOther = []; meetupEvents = events;
		name = name.replace(/\W/g,'').toLowerCase(); let minDif, eMin, nameMatch = true;
		//Check events for class name matches:
		for(let i=0,e,l=events.length; i<l; i++) {
			e = events[i]; if(name && e.name.replace(/\W/g,'').toLowerCase()
			.indexOf(name) !== -1) eNameMatch.push(e); else eOther.push(e);
		}
		//Find event with closest date & matching name:
		for(let i=0,e,dif,l=eNameMatch.length; i<l; i++) {
			e = eNameMatch[i]; dif = Math.abs(time - e.time);
			if(minDif == null || dif < minDif) { minDif = dif; eMin = e; }
		}
		//If no matches, try again with non-matching name events:
		if(minDif == null || minDif > WEEK_MS) {
			minDif = null; nameMatch = false;
			for(let i=0,e,dif,l=eOther.length; i<l; i++) {
				e = eOther[i]; dif = Math.abs(time - e.time);
				if(minDif == null || dif < minDif) { minDif = dif; eMin = e; }
			}
		}
		if(minDif == null || minDif > WEEK_MS) callback(false); else { //Further 1 week away?
			let acc = (WEEK_MS-minDif)/WEEK_MS;
			if(!nameMatch && acc > 0.2) acc -= 0.2; //Detract accuracy points for no name-match.
			callback(eMin, (acc*100).toFixed(1)+'%');
		}
	}
	if(meetupEvents == null) utils.loadJSONP(EventsListURI, process, 8000);
	else process({data:meetupEvents});
}

function showInfo(msg, bg) {
	console.info(msg); infoBox.textContent = msg;
	if(!bg) bg = 'rgba(150,20,0,0.8)'; if(supportsBdf) bg = bg.substr(0,bg.lastIndexOf(',')+1)+'0.5)';
	const es = infoBox.style; es.background = bg; es.transition = null; es.opacity = 0;
	setTimeout(function() { es.transition = 'opacity 0.5s ease-out'; es.opacity = 1; },0);
}

function selBoxValue(sb) {
	const op = sb.options; return op[op.selectedIndex].label;
}