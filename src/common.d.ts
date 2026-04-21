type AttendeeList = [name: string, note: string, level: string, pay: string][];

interface Member {
	name: string;
	id: number;
	email: string;
	fee: number;
	level?: string;
	h: boolean;
	_x?: number;
}

interface EventData {
	name: string;
	id: number;
	link: string;
	ven: string;
	loc: string;
	date: string;
	yes: number;
	wait: number;
	fee: string;
	time: string;
	desc: string;
	fRaw: number;
	dRaw: string;
	hosts: Member[];
	rsvp: Member[];
	raw?: [any, any];
}