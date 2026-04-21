declare module '*.css';
declare module '*.svg';

interface Window {test: () => void}
interface CSSStyleDeclaration {
	opacity: number | '';
}

declare const Hdr: HTMLElement;
declare const VId: HTMLElement;
declare const Status: HTMLElement;
declare const MuMatch: HTMLElement;
declare const MuReject: HTMLButtonElement;
declare const MuApply: HTMLButtonElement;
declare const SBtn: HTMLButtonElement;
declare const EIN: HTMLElement;
declare const ClsData: HTMLElement;
declare const InfoBox: HTMLElement;
declare const ContBox: HTMLElement;
declare const BgBox: HTMLCanvasElement & {
	_c: CanvasRenderingContext2D;
	_i: HTMLImageElement;
	_w: number;
	_h: number;
	_r: number;
};

type NumField = import('raiutils').NumField;
interface ATblRow extends HTMLTableRowElement {
	/** Name */
	_n: HTMLInputElement;
	/** Member Level */
	_m: HTMLInputElement;
	/** Notes */
	_x: HTMLSelectElement;
	/** Payment */
	_p: NumField;
}

//Fields
declare const FTitle: HTMLInputElement & {n?: string};
declare const FAdc: HTMLSelectElement;
declare const FDate: HTMLInputElement;
declare const FName: HTMLInputElement;
declare const FMail: HTMLInputElement;
declare const FPay: HTMLSelectElement;
declare const FType: HTMLSelectElement;
declare const FCost: NumField;
declare const FCount: NumField;
declare const FMatCost: NumField;
declare const FMatFiles: HTMLInputElement;
declare const FRate: NumField;
declare const FRateInfo: HTMLElement;
declare const FDonate: HTMLInputElement;
declare const ATbl: HTMLTableElement & {children: ATblRow[]};