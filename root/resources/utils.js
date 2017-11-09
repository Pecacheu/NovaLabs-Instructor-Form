//This work is licensed under a GNU General Public License, v3.0. Visit http://gnu.org/licenses/gpl-3.0-standalone.html for details.
//Javscript Utils (version 8.2), functions by http://github.com/Pecacheu unless otherwise stated.

"use strict";

const utils = {};

//UtilRect Objects & ClientRect Polyfill:
if(!window.ClientRect) window.ClientRect = DOMRect;

function UtilRect(t,b,l,r) {
	if(!(this instanceof UtilRect)) throw "UtilRect constructor must use new keyword!";
	const f = Number.isFinite; let tt=0,bb=0,ll=0,rr=0;
	if(f(t) && f(b) && f(l) && f(r)) { tt = t; bb = b; ll = l; rr = r; }
	else if(t instanceof ClientRect) { tt = t.top; bb = t.bottom; ll = t.left; rr = t.right; }
	
	utils.addProp(this,['top','x'],function(){return tt},function(v){if(f(v))tt=v});
	utils.addProp(this,'bottom',function(){return bb},function(v){if(f(v))bb=v});
	utils.addProp(this,['left','y'],function(){return ll},function(v){if(f(v))ll=v});
	utils.addProp(this,'right',function(){return rr},function(v){if(f(v))rr=v});
	
	utils.addProp(this,'width',function(){return rr-ll},function(v){if(f(v)){if(v<0)v=0;rr=ll+v}});
	utils.addProp(this,'height',function(){return bb-tt},function(v){if(f(v)){if(v<0)v=0;bb=tt+v}});
}

//Check if UtilRect contains point or other rect:
UtilRect.prototype.contains = function(x, y) {
	if(typeof x == 'object') return x.left >= this.left && x.right
	<= this.right && x.top >= this.top && x.bottom <= this.bottom;
	return x >= this.left && x <= this.right && y >= this.top && y <= this.bottom;
};

//Expand (or contract if negative) a UtilRect by amout of pixels.
//Useful for using UtilRect objects as element hitboxes. Returns self for chaining.
UtilRect.prototype.expand = function(by) {
	this.top -= by; this.left -= by; this.bottom += by;
	this.right += by; return this;
};

(function(){ //Utils Library

//Cookie Parsing.
utils.setCookie = function(name,value,exp,secure) {
	let c = encodeURIComponent(name)+'='+(value==null?'':encodeURIComponent(value));
	if(exp != null) {
		if(!(exp instanceof Date)) exp = new Date(exp);
		c += ';expires='+exp.toUTCString();
	}
	if(secure) c += ';secure'; document.cookie = c;
}
utils.remCookie = function(name) {
	document.cookie = encodeURIComponent(name)
	+'=;expires='+new Date(0).toUTCString();
}
utils.getCookie = function(name) {
	const n1 = encodeURIComponent(name), n2 = ' '+n1, cl = document.cookie.split(';');
	for(let i=0,l=cl.length,c,eq,sub; i<l; i++) {
		c = cl[i]; eq = c.indexOf('='); sub = c.substr(0,eq);
		if(sub == n1 || sub == n2) return decodeURIComponent(c.substr(eq+1));
	}
	return null;
}

//Like Java.
String.prototype.startsWith = function(s) { return this.substr(0,s.length) === s; }
String.prototype.endsWith = function(s) { return this.substr(this.length-s.length) === s; }

//Convert String to Title Case.
utils.titleCase = function(s) {
	s = s.toLowerCase().split(/(?=[^a-zA-Z](?=[a-zA-Z]))/g);
	for(let i=0,l=s.length,w; i<l; i++) {
		w=s[i]; if(i==0) s[i] = w[0].toUpperCase()+w.substr(1);
		else if(s[i].length > 1) s[i] = w[0]+w[1].toUpperCase()+w.substr(2);
	}
	return s.join('');
}

//Deep (recursive) Object.create cloning function.
//If sub is set to false, will only copy 1 level deep.
utils.copy = function(o,sub) {
	if(!o || typeof o !== 'object') return o;
	const o2 = {}, ok = Object.keys(o);
	for(let i=0,l=ok.length,k; i<l; i++) {
		k = ok[i]; o2[k] = sub===false?o[k]:utils.copy(o[k]);
	}
	return o2;
}

//UserAgent-based Mobile device detection.
utils.mobile = ('orientation' in window || navigator.userAgent.match(/Mobi/i));

//Generates modified input field for css skinning on unsupported browsers. This is a JavaScript
//fallback for when css 'appearance:none' doesn't work. For Mobile Safari, this is usually
//needed with 'datetime-local', 'select-one', and 'select-multiple' input types.
utils.skinnedInput = function(el) {
	const cont = utils.mkDiv(null,el.className), is = el.style, type = el.type; el.className += ' isSub';
	if(type == 'datetime-local' || type == 'select-one' || type == 'select-multiple') { //Datetime or Select:
		is.opacity = 0; is.top = '-100%'; const text = utils.mkEl('span',cont,'isText');
		utils.mkEl('span',cont,'isArrow',{borderTopColor:getComputedStyle(el).color});
		function onChange() { switch(type) {
			case 'datetime-local': text.textContent = utils.formatDate(utils.fromDateTimeBox(this)); break;
			case 'select-one': text.textContent = selBoxLabel(this); break;
			case 'select-multiple': text.textContent = mulBoxLabel(this); break;
		}}
		el.addEventListener('change', onChange); onChange.call(el);
		el.forceUpdate = onChange;
	}
	el.replaceWith(cont); cont.appendChild(el);
	//Append StyleSheet:
	if(!document.isStyles) { document.isStyles = true; utils.mkEl('style',document.body,null,null,'.isSub {\
		width:100% !important; height:100% !important; border:none !important; display:inline-block !important;\
		position:relative !important; box-shadow:none !important; margin:0 !important; padding:initial !important;\
	}\
	.isText {\
		display:inline-block; height:100%; max-width:95%;\
		overflow:hidden; text-overflow:ellipsis; white-space:nowrap;\
	}\
	.isArrow {\
		width:0; height:0; display:inline-block; float:right; top:38%; position:relative;\
		border-left:3px solid transparent; border-right:3px solid transparent;\
		border-top:6px solid #000; vertical-align:middle;\
	}'); }
}

function selBoxLabel(sb) {
	const op = sb.options; if(op.selectedIndex != -1) return op[op.selectedIndex].label;
	return "No Options Selected";
}
function mulBoxLabel(sb) {
	const op = sb.options; let str = ''; for(let i=0,l=op.length; i<l; i++)
	if(op[i].selected) str += (str?', ':'')+op[i].label; return str||"No Options Selected";
}

//Turns your boring <input> into a mobile-friendly number entry field with max/min & negative support.
//Optional 'decMax' parameter is maximum percision of decimal allowed. (ex. 3 would give percision of 0.001)
//On mobile, use star key for decimal point and pound key for negative.
utils.numField = function(field, min, max, decMax) {
	if(min == null) min = -2147483648; if(max == null) max = 2147483647;
	field.setAttribute('pattern',"\\d*"); if(decMax) field.type = 'tel'; else field.type = 'number';
	field.ns = field.value = (field.num = Number(field.value)||0).toString();
	field.onkeydown = function(e) {
		const k = e.key, kn = (k.length==1)?Number(k):null, dAdd = decMax && this.num != max && this.num != min,
		old = this.ns; let len = this.ns.length, dec = this.ns.indexOf('.'), neg = this.ns.indexOf('-')!=-1;
		
		if(kn || kn == 0) { if(dec == -1 || len-dec < decMax+1) this.ns += k; } //Number.
		else if(dAdd && (k == '.' || k == '*') && dec == -1) this.ns += '.'; //Decimal.
		else if(k == 'Backspace' || k == 'Delete') this.ns = this.ns.substr(0,len-1); //Backspace.
		else if(min < 0 && (k == '-' || k == '#') && len == 0) { this.ns = '-'; neg = true; } //Negative Key.
		else if(k == 'ArrowUp') this.ns = (this.num+(this.step||1)).toString(); //Up Key.
		else if(k == 'ArrowDown') this.ns = (this.num-(this.step||1)).toString(); //Down Key.
		len = this.ns.length; dec = this.ns.indexOf('.');
		if(dec != -1 && len-dec > decMax+1) len = (this.ns = this.ns.substr(0,dec+decMax+1)).length;
		
		let n = Number(this.ns)||0; if(!n && dec == -1 && !neg) this.ns = '';
		if(n > max) { n = max; this.ns = n.toString(); }
		else if(n < min) { n = min; this.ns = n.toString(); }
		
		const nOld = this.num; this.num = n;
		if(this.onnuminput && this.onnuminput(n) === false) { this.ns = old; this.num = nOld; }
		else if(len) this.value = (neg&&!n?'-':'')+n+(dec!=-1&&n%1==0?'.0':''); else this.value = n;
		e.preventDefault();
	}
	field.set = function(n) {
		n = Number(n)||0; if(!decMax) n = Math.floor(n);
		if(n > max) n = max; if(n < min) n = min;
		this.value = this.num = n; this.ns = n.toString();
		if(this.onnuminput) this.onnuminput(n);
	}
}

//Turns your boring <input> into a mobile-friendly currency entry field, optionally with custom currency symbol.
//On mobile, use star key for decimal point.
utils.costField = function(field, sym) {
	field.setAttribute('pattern',"\\d*"); field.type = 'tel';
	field.value = utils.formatCost(field.num = Number(field.value)||0,sym); field.ns = field.num.toString();
	field.onkeydown = function(e) {
		const k = e.key, kn = (k.length==1)?Number(k):null, len = this.ns.length, old = this.ns;
		let dec = this.ns.indexOf('.');
		
		if(kn || kn == 0) { if(dec == -1 || len-dec < 3) this.ns += k; } //Number.
		else if((k == '.' || k == '*') && dec == -1) { this.ns += '.'; dec = len; } //Decimal.
		else if(k == 'Backspace' || k == 'Delete') this.ns = this.ns.substr(0,len-1); //Backspace.
		else if(k == 'ArrowUp') this.ns = (this.num+1).toString(); //Up Key.
		else if(k == 'ArrowDown' && this.num >= 1) this.ns = (this.num-1).toString(); //Down Key.
		
		const n = Number(this.ns)||0; if(!n && dec == -1) this.ns = '';
		
		const nOld = this.num; this.num = n;
		if(this.onnuminput && this.onnuminput(n) === false) { this.ns = old; this.num = nOld; }
		else this.value = utils.formatCost(n,sym);
		e.preventDefault();
	}
	field.set = function(n) {
		n = Math.floor((Number(n)||0)*100)/100; this.num = n;
		this.value = utils.formatCost(n,sym); this.ns = n.toString();
		if(this.onnuminput) this.onnuminput(n);
	}
}

//Format Number as Currency. Uses '$' by default.
utils.formatCost = function(n, sym) {
	if(!sym) sym = '$'; if(!n) return sym+'0.00';
	const p = n.toFixed(2).split('.');
	return sym+p[0].split('').reverse().reduce(function(a, n, i)
	{ return n=='-'?n+a:n+(i&&!(i%3)?',':'')+a; },'')+'.'+p[1];
}

//Convert value from 'datetime-local' input to Date object.
utils.fromDateTimeBox = function(el) {
	const v=el.value; if(!v) return new Date();
	return new Date(v.replace(/-/g,'/').replace(/T/g,' '));
}

//Convert Date object into format to set 'datetime-local'
//input value, optionally including seconds if 'sec' is true.
utils.toDateTimeBox = function(d, sec) {
	return d.getFullYear()+'-'+fixedNum2(d.getMonth()+1)+'-'+fixedNum2(d.getDate())+'T'+
	fixedNum2(d.getHours())+':'+fixedNum2(d.getMinutes())+(sec?':'+fixedNum2(d.getSeconds()):'');
}

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fixedNum2(num) { if(num <= 9) return '0'+num; return num; }

//Format Date object into human-readable string.
utils.formatDate = function(d) {
	if(d == null || !d.getDate || !d.getFullYear()) return "Invalid Date";
	const mins=d.getMinutes(), month=d.getMonth(), day=d.getDate(), year=d.getFullYear();
	let hour=d.getHours(), pm=false; if(hour >= 12) { pm = true; hour -= 12; } if(hour == 0) hour = 12;
	return hour+':'+fixedNum2(mins)+' '+(pm?'PM':'AM')+' '+months[month]+' '+utils.suffix(day)+', '+year;
}

//Add appropriate suffix to number. (ex. 31st, 12th, 22nd)
utils.suffix = function(n) {
	let j = n % 10, k = n % 100;
	if(j == 1 && k != 11) { return n + "st"; }
	if(j == 2 && k != 12) { return n + "nd"; }
	if(j == 3 && k != 13) { return n + "rd"; }
	return n + "th";
}

//Virtual Page Navigation:
utils.goBack = function(){history.back()};
utils.goForward = function(){history.forward()};
utils.go = function(id) {
	const a = Array.from(arguments);
	if(id != null) history.pushState(a,id,'#'+id); doNav(a);
}
window.addEventListener('popstate', function(e){doNav(e.state)});
window.addEventListener('load', function(){setTimeout(function(){doNav(history.state)},1)});

function doNav(s) {
	if(!Array.isArray(s)) s = [location.hash.substr(1)];
	if(utils.onNav) utils.onNav.apply(null,s);
}

//Create element with tag, parent, classes, style properties, and innerHTML content.
//Supply null (or undefined) for any parameters to leave blank.
utils.mkEl = function(tag, p, c, s, i) {
	const e = document.createElement(tag);
	if(c != null) e.className = c; if(i != null) e.innerHTML = i;
	if(s != null && typeof s == 'object') {
		const k = Object.keys(s), l = k.length;
		for(let i=0; i<l; i++) e.style[k[i]] = s[k[i]];
	}
	if(p != null) p.appendChild(e); return e;
}
utils.mkDiv = function(p, c, s, i) { return utils.mkEl('div',p,c,s,i); }
utils.addText = function(el, text) { el.appendChild(document.createTextNode(text)); }

//It's useful for any canvas-style webpage to have the page dimensions on hand.
//Function by: http://w3schools.com/jsref/prop_win_innerheight.asp
utils.updateSize = function() {
	utils.width = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;
	utils.height = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;
}

//Get predicted width of text given CSS font style.
utils.textWidth = function(text, font) {
	const canvas = window.textWidthCanvas || (window.textWidthCanvas = document.createElement('canvas')),
	context = canvas.getContext('2d'); context.font = font; return context.measureText(text).width;
}

//Add a getter/setter pair to an existing object:
utils.addProp = function(obj, name, getter, setter) {
	const t={}; if(getter) t.get=getter; if(setter) t.set=setter;
	if(Array.isArray(name)) for(let i=0,l=name.length; i<l; i++) Object.defineProperty(obj, name[i] ,t);
	else Object.defineProperty(obj, name, t);
}

//Remove "empty" elements like 0, false, " ",
//undefined, and NaN from an array. Set 'keepZero'
//to true to keep elements that are set to '0'.
//Useful in combination with Array.split.
//Function by: Pecacheu & http://stackoverflow.com/users/5445/cms
Array.prototype.clean = function(keepZero) {
	for(let i=0,e,l=this.length; i<l; i++) {
		e=this[i]; if(utils.isBlank(e) || e === false ||
		!keepZero && e === 0) { this.splice(i,1); i--; l--; }
	} return this;
}

//Remove first instance of item from array. Returns false if not found.
Array.prototype.remove = function(item) {
	const ind = this.indexOf(item); if(ind == -1) return false;
	this.splice(ind,1); return true;
}

//Get an element's index in it's parent. Returns -1 if the element has no parent.
utils.addProp(Element.prototype,'index',function() {
	const p = this.parentElement; if(!p) return -1;
	return Array.prototype.indexOf.call(p.children, this);
});

//Insert child at index:
Element.prototype.insertChildAt = function(el, i) {
	if(i<0) i=0; if(i >= this.children.length) this.appendChild(el);
	else this.insertBefore(el, this.children[i]);
}

//Get element bounding rect as UtilRect object:
utils.addProp(Element.prototype,'boundingRect',function() {
	return new UtilRect(this.getBoundingClientRect());
});

//No idea why this isn't built-in, but it's not.
Math.cot = function(x) {return 1/Math.tan(x)}

//Check if string, array, or other object is empty or not.
utils.isBlank = function(s) {
	if(s == null) return true;
	if(typeof s == 'string') return !/\S/.test(s);
	if(typeof s == 'object') {
		if(typeof s.length == 'number') return s.length === 0;
		return Object.keys(s).length === 0;
	}
	return false;
}

//Finds first empty (undefined) slot in array.
utils.firstEmpty = function(arr) {
	const len = arr.length;
	for(let i=0; i<len; i++) if(arr[i] == null) return i;
	return len;
}

//Like 'firstEmpty', but uses letters a-Z instead.
utils.firstEmptyChar = function(obj) {
	const keys = Object.keys(obj), len = keys.length;
	for(let i=0; i<len; i++) if(obj[keys[i]] == null) return keys[i];
	return utils.numToChar(len);
}

//Converts a number into letters (upper and lower) from a to Z.
utils.numToChar = function(num) {
	if(num<=25) return String.fromCharCode(num+97);
	else if(num>=26 && num<=51) return String.fromCharCode(num+39);
	let mVal, fVal;
	if(num<2756) { mVal=utils.rstCount(Math.floor(num/52)-1,52); fVal=utils.rstCount(num,52); }
	else if(num<143364) { mVal=utils.rstCount(Math.floor((num-52)/2704)-1,52); fVal=utils.rstCount(num-52,2704)+52; }
	else if(num<7454980) { mVal=utils.rstCount(Math.floor((num-2756)/140608)-1,52); fVal=utils.rstCount(num-2756,140608)+2756; }
	else return false; //More than "ZZZZ"? No. Just, no.
	return utils.numToChar(mVal)+utils.numToChar(fVal);
}

//Use this to reset your counter each time 'maxVal' is reached.
utils.rstCount = function(val, maxVal) { while(val >= maxVal) val -= maxVal; return val; }
//This alternate method doesn't always work due to inaccuracy of trig functions:
//function squareWave(x,p) {a=p/2; return Math.round(-(2*a/Math.PI)*Math.atan(utils.cot(x*Math.PI/p))+a)}

//Merges two (or more) objects,
//giving the last one precedence.
//Function by: https://gist.github.com/padolsey/272905
utils.merge = function(target, source /*, source2, ... */) {
	if(typeof target !== 'object') target = {};
	for(let property in source) {
		if(source.hasOwnProperty(property)) {
		let sourceProperty = source[property];
			if(typeof sourceProperty === 'object') {
				target[property] = utils.merge(target[property], sourceProperty);
				continue;
			}
			target[property] = sourceProperty;
		}
	}
	for(let a=2,l=arguments.length; a<l; a++) utils.merge(target, arguments[a]);
	return target;
}

//Returns 0 if a is negative, or a otherwise.
utils.pos = function(a) {
	if(a < 0) return 0; else return a;
}

//Keeps value within max/min bounds.
utils.bounds = function(val, min, max) {
	if(typeof val != 'number') return min;
	if(val>max) return max; if(val<min) return min; return val;
}

//Values in range lower to upper are translated to range from 0 to 1.
utils.section = function(input, lower, upper) {
	return (utils.range(input, lower, upper) - lower) / (upper - lower);
}

//"Normalizes" a value so that it ranges from low -> high,
//but unlike utils.range, this function retains input's offset.
//This can be used to easily clip angles, either RAD or DEG, to a certian range.
utils.normalize = function(val, min, max) {
	let cycle = Math.abs(max-min);
	if(val < min) while(val < min) val += cycle;
	else while(val >= max) val -= cycle;
	return val;
}

//Finds and removes all instances of 'remStr' string contained
//within 'inStr', and retuns the resulting string.
utils.cutStr = function(inStr, remStr) {
	let str = inStr, fnd; while((fnd=str.indexOf(remStr)) != -1) {
		str = str.slice(0, fnd)+str.slice(fnd+remStr.length);
	}
	return str;
}

//Polyfill for String.trim()
//Function by: http://www.w3schools.com/
if(!String.prototype.trim) String.prototype.trim = function(str) {
	if(str.trim) return str.trim(); return str.replace(/^\s+|\s+$/gm,'');
}

//Given CSS property value 'prop', returns object with
//space-seperated values from the property string.
utils.parseCSS = function(prop) {
	const pArr={}, pKey="", keyNum=0; prop=prop.trim();
	function parseInner(str) {
		if(str.indexOf(',') !== -1) {
			const arr = utils.clean(str.split(','));
			for(let i=0, l=arr.length; i<l; i++) arr[i]=arr[i].trim();
			return arr;
		}
		return str.trim();
	}
	while(prop.length > 0) {
		if(prop[0] == '(' && prop.indexOf(')') !== -1 && pKey) {
			let end=prop.indexOf(')'), pStr=prop.substring(1, end);
			pArr[pKey] = parseInner(pStr);
			pKey = ""; prop = prop.substring(end+1);
		} else if(prop.search(/[#!\w]/) == 0) {
			if(pKey) { pArr[keyNum] = pKey; keyNum++; }
			let end=prop.search(/[^#!\w-%]/); if(end==-1) end=prop.length;
			pKey = prop.substring(0, end); prop = prop.substring(end);
		} else {
			prop = prop.substring(1);
		}
	}
	if(pKey) pArr[keyNum] = pKey; return pArr;
}

//Rebuilds CSS string from a parseCSS object.
utils.buildCSS = function(propArr) {
	const keyArr=Object.keys(propArr), l=keyArr.length; let pStr='', i=0;
	while(i<l) { const k = keyArr[i], v = propArr[keyArr[i]]; i++;
	if(0<=Number(k)) pStr += v+" "; else pStr += k+"("+v+") "; }
	return pStr.substring(0, pStr.length-1);
}

//Create a CSS class and append it to the current document. Fill 'propList' object
//with keys and values repersenting the CSS properties you want to add to the class.
utils.addClass = function(className, propList) {
	let style, str=''; const keys = Object.keys(propList);
	if(document.styleSheets.length > 0) style = document.styleSheets[0]; else {
		style = document.createElement('style');
		style.appendChild(document.createTextNode(''));
		document.head.appendChild(style);
	}
	for(let i=0,l=keys.length; i<l; i++) str += keys[i]+":"+propList[keys[i]]+";";
	style.insertRule("."+className+"{"+str+"}", 1);
}

//Create a CSS selector and append it to the current document.
utils.addId = function(idName, propList) {
	let style, str=''; const keys = Object.keys(propList);
	if(document.styleSheets.length > 0) style = document.styleSheets[0]; else {
		style = document.createElement('style');
		style.appendChild(document.createTextNode(''));
		document.head.appendChild(style);
	}
	for(let i=0,l=keys.length; i<l; i++) str += keys[i]+":"+propList[keys[i]]+";";
	style.insertRule("#"+idName+"{"+str+"}", 1);
}

//Create a CSS keyframe and append it to the current document.
utils.addKeyframe = function(name, content) {
	let style; if(document.styleSheets.length > 0) style = document.styleSheets[0]; else {
		style = document.createElement('style');
		style.appendChild(document.createTextNode(''));
		document.head.appendChild(style);
	}
	style.insertRule("@keyframes "+name+"{"+content+"}", 1);
}

//Remove a CSS class from all stylesheets in the current document.
utils.removeClass = function(className) {
	for(let s=0,style,rList,j=document.styleSheets.length; s<j; s++) {
		style = document.styleSheets[s]; rList = style.rules;
		for(key in rList) if(rList[key].type == 1 && rList[key]
		.selectorText == "."+className) style.removeRule(key);
	} //rule.type #1 = CSSStyleRule
}

//Converts HEX color to RGB.
//Function by: https://github.com/Pecacheu and others
utils.hexToRgb = function(hex) {
	let raw = parseInt(hex.substr(1), 16);
	return [(raw >> 16) & 255, (raw >> 8) & 255, raw & 255];
}

//Generates a random interger somewhere between min and max.
utils.rand = function(min, max) { return Math.floor(Math.random() * (max-min+1) + min); }

//Convert a url query string into a JavaScript object:
//Function by: Pecacheu (From Pecacheu's Apache Test Server)
utils.fromQuery = function(string) {
	function parse(params, pairs) {
		const pair = pairs[0], spl = pair.indexOf('='),
		key = decodeURIComponent(pair.substr(0,spl)),
		value = decodeURIComponent(pair.substr(spl+1));
		//Handle multiple parameters of the same name:
		if(params[key] == null) params[key] = value;
		else if(typeof params[key] == 'array') params[key].push(value);
		else params[key] = [params[key],value];
		return pairs.length == 1 ? params : parse(params, pairs.slice(1));
	} return string.length == 0 ? {} : parse({}, string.split('&'));
}

//Convert an object into a url query string:
utils.toQuery = function(obj) {
	let str = ''; if(typeof obj != 'object') return encodeURIComponent(obj);
	for(let key in obj) {
		let val = obj[key]; if(typeof val == 'object') val = JSON.stringify(val);
		str += '&'+key+'='+encodeURIComponent(val);
	} return str.slice(1);
}

//Various methods of centering objects using JavaScript.
//obj: Object to center.
//only: 'x' for only x axis centering, 'y' for only y axis.
//type: 'calc', 'trans', 'move', or null for different centering methods.
utils.centerObj = function(obj, only, type) {
	if(!obj.style.position) obj.style.position = "absolute";
	if(type == 'calc') { //Efficient, but Only Responsive for Changes in Page Size:
		if(!only || only == "x") obj.style.left = "calc(50% - "+(obj.clientWidth/2)+"px)";
		if(!only || only == "y") obj.style.top = "calc(50% - "+(obj.clientHeight/2)+"px)";
	} else if(type == 'move') { //Original, Not Responsive:
		if(!only || only == "x") obj.style.left = (utils.width/2)-(obj.clientWidth/2)+"px";
		if(!only || only == "y") obj.style.top = (utils.height/2)-(obj.clientHeight/2)+"px";
	} else if(type == 'trans') { //More Efficient:
		let trans = utils.cutStr(obj.style.transform, "translateX(-50%)");
		trans = utils.cutStr(trans, "translateY(-50%)");
		if(!only || only == "x") { obj.style.left = "50%"; trans += "translateX(-50%)"; }
		if(!only || only == "y") { obj.style.top = "50%"; trans += "translateY(-50%)"; }
		if(trans) obj.style.transform = trans;
	} else { //Largest Browser Support for Responsive Centering:
		let cont = document.createElement("div"); obj.parentNode.appendChild(cont);
		cont.style.display = "table"; cont.style.position = "absolute"; cont.style.top = 0;
		cont.style.left = 0; cont.style.width = "100%"; cont.style.height = "100%";
		obj.parentNode.removeChild(obj); cont.appendChild(obj); obj.style.display = "table-cell";
		if(!only || only == "x") { obj.style.textAlign = "center"; }
		if(!only || only == "y") { obj.style.verticalAlign = "middle"; }
		obj.style.position = "relative";
	}
}

//Loads a file at the address via HTML object tag. Callback
//is fired with either recieved data, or 'false' if unsucessful.
utils.loadFile = function(path, callback, timeout) {
	const obj = document.createElement('object'); obj.data = path;
	obj.style.position = 'fixed'; obj.style.opacity = 0;
	let tmr = setTimeout(function() {
		document.body.removeChild(obj);
		tmr = null; callback(false);
	}, timeout||4000);
	obj.onload = function() {
		const data = obj.contentDocument.documentElement.outerHTML;
		if(tmr) clearTimeout(tmr); document.body.removeChild(obj);
		callback(data);
	}
	document.body.appendChild(obj);
}

//Loads a file at the address from a JSONP-enabled server. Callback
//is fired with either recieved data, or 'false' if unsucessful.
utils.loadJSONP = function(path, callback, timeout) {
	const script = document.createElement('script'), id = utils.firstEmptyChar(utils.lJSONCall);
	script.type = 'application/javascript'; script.src = path+'&callback=utils.lJSONCall.'+id;
	let tmr = setTimeout(function() { delete utils.lJSONCall[id]; callback(false); }, timeout||4000);
	utils.lJSONCall[id] = function(data) {
		if(tmr) clearTimeout(tmr); delete utils.lJSONCall[id]; callback(data);
	}
	document.head.appendChild(script); document.head.removeChild(script);
}; utils.lJSONCall = [];

//Loads a file and returns it's contents using HTTP GET.
//Callback parameters: (data, err)
//err: non-zero on error. Standard HTTP error codes.
//queryData: Optional, object of url query data key/value pairs.
//contentType: Optional, sets content type header.
//Returns: false if AJAX not supported, true otherwise.
utils.loadAjax = function(path, callback, queryData, contentType) {
	//Obtain HTTP Object:
	let http; if(window.XMLHttpRequest) { //Chrome, Safari, Firefox, Edge:
		try {http = new XMLHttpRequest()} catch(e) {return e}
	} else if(window.ActiveXObject) { //IE6 and older:
		try {http = new ActiveXObject("Msxml2.XMLHTTP")} catch(e) {
		try {http = new ActiveXObject("Microsoft.XMLHTTP")} catch(e) {return e}}
	} else return false;
	//Open & Set HTTP Headers:
	http.open("GET", path, true);
	if(contentType) http.setRequestHeader("Content-type", contentType);
	http.onreadystatechange = function(event) { //Handle state change:
		if(event.target.readyState === XMLHttpRequest.DONE) {
			if(event.target.status == 200) callback(event.target.response, 0);
			else callback("", event.target.status);
		}
	}
	http.send(queryData?utils.toQuery(queryData):null); //Send Request
	return true;
}

//Converts from degrees to radians, so you can convert back for given stupid library.
//Function by: The a**hole who invented radians.
utils.rad = function(deg) { return deg * Math.PI / 180; }

//Converts from radians to degrees, so you can work in degrees.
//Function by: The a**hole who invented radians.
utils.deg = function(rad) { return rad * 180 / Math.PI; }

//I figued the following formula out on my own when I was like 5, so I'm very proud of it...

//Pecacheu's ultimate unit translation formula:
//This Version -- Bounds Checking: NO, Rounding: NO, Max/Min Switching: NO, Easing: YES
utils.map = function(input, minIn, maxIn, minOut, maxOut, easeFunc) {
	if(!easeFunc) easeFunc = function(t) { return t; }
	return (easeFunc((input-minIn)/(maxIn-minIn))*(maxOut-minOut))+minOut;
}

})(); //End of Utils Library

//JavaScript Easing Library, CREATED BY: http://github.com/gre

/*Easing Functions - inspired from http://gizma.com/easing/
only considering the t value for the range [0,1] => [0,1]*/
const Easing = {
	//no easing, no acceleration
	linear:function(t) { return t },
	//accelerating from zero velocity
	easeInQuad:function(t) { return t*t },
	//decelerating to zero velocity
	easeOutQuad:function(t) { return t*(2-t) },
	//acceleration until halfway, then deceleration
	easeInOutQuad:function(t) { return t<.5 ? 2*t*t : -1+(4-2*t)*t },
	//accelerating from zero velocity
	easeInCubic:function(t) { return t*t*t },
	//decelerating to zero velocity
	easeOutCubic:function(t) { return (--t)*t*t+1 },
	//acceleration until halfway, then deceleration
	easeInOutCubic:function(t) { return t<.5 ? 4*t*t*t : (t-1)*(2*t-2)*(2*t-2)+1 },
	//accelerating from zero velocity
	easeInQuart:function(t) { return t*t*t*t },
	//decelerating to zero velocity
	easeOutQuart:function(t) { return 1-(--t)*t*t*t },
	//acceleration until halfway, then deceleration
	easeInOutQuart:function(t) { return t<.5 ? 8*t*t*t*t : 1-8*(--t)*t*t*t },
	//accelerating from zero velocity
	easeInQuint:function(t) { return t*t*t*t*t },
	//decelerating to zero velocity
	easeOutQuint:function(t) { return 1+(--t)*t*t*t*t },
	//acceleration until halfway, then deceleration
	easeInOutQuint:function(t) { return t<.5 ? 16*t*t*t*t*t : 1+16*(--t)*t*t*t*t }
};